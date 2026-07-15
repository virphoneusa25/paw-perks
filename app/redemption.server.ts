import { randomBytes } from "node:crypto";

import prisma from "./db.server";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: {
      variables?: Record<string, unknown>;
    },
  ) => Promise<Response>;
};

type RedemptionInput = {
  shop: string;
  loyaltyCustomerId: string;
  rewardDefinitionId: string;
  admin: AdminGraphqlClient;
};

type DiscountCreateResponse = {
  data?: {
    discountCodeBasicCreate?: {
      codeDiscountNode?: {
        id?: string;
      } | null;
      userErrors?: Array<{
        field?: string[] | null;
        message: string;
        code?: string | null;
      }>;
    };
  };
  errors?: Array<{
    message: string;
  }>;
};

function generateDiscountCode(): string {
  const randomPart = randomBytes(6)
    .toString("hex")
    .toUpperCase();

  return `PAW-${randomPart}`;
}

function customerGid(shopifyCustomerId: string): string {
  if (shopifyCustomerId.startsWith("gid://shopify/Customer/")) {
    return shopifyCustomerId;
  }

  return `gid://shopify/Customer/${shopifyCustomerId}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);

  result.setUTCDate(result.getUTCDate() + days);

  return result;
}

function buildDiscountValue(
  discountType: string,
  discountValue: number,
) {
  if (discountType === "PERCENTAGE") {
    return {
      percentage: discountValue / 100,
    };
  }

  return {
    discountAmount: {
      amount: (discountValue / 100).toFixed(2),
      appliesOnEachItem: false,
    },
  };
}

function buildMinimumRequirement(
  minimumSpend: number | null,
) {
  if (minimumSpend === null || minimumSpend <= 0) {
    return undefined;
  }

  return {
    subtotal: {
      greaterThanOrEqualToSubtotal: (
        minimumSpend / 100
      ).toFixed(2),
    },
  };
}

export async function redeemReward({
  shop,
  loyaltyCustomerId,
  rewardDefinitionId,
  admin,
}: RedemptionInput) {
  /*
   * Load these first for validation and for building the Shopify
   * discount payload. They are checked again inside the transaction.
   */
  const [initialCustomer, initialReward] = await Promise.all([
    prisma.loyaltyCustomer.findFirst({
      where: {
        id: loyaltyCustomerId,
        shop,
      },
    }),

    prisma.rewardDefinition.findFirst({
      where: {
        id: rewardDefinitionId,
        shop,
      },
    }),
  ]);

  if (!initialCustomer) {
    throw new Error("The Paw Perks customer was not found.");
  }

  if (!initialReward) {
    throw new Error("The selected reward was not found.");
  }

  if (!initialReward.isActive) {
    throw new Error("The selected reward is not active.");
  }

  if (
    initialReward.discountType !== "FIXED_AMOUNT" &&
    initialReward.discountType !== "PERCENTAGE"
  ) {
    throw new Error(
      `Unsupported reward discount type: ${initialReward.discountType}`,
    );
  }

  const discountCode = generateDiscountCode();

  /*
   * Reserve the points before making the external Shopify call.
   * updateMany with pointsBalance >= pointsRequired prevents two
   * simultaneous redemptions from spending the same points.
   */
  const reservation = await prisma.$transaction(async (tx) => {
    const reward = await tx.rewardDefinition.findFirst({
      where: {
        id: rewardDefinitionId,
        shop,
        isActive: true,
      },
    });

    if (!reward) {
      throw new Error(
        "The reward is no longer available.",
      );
    }

    const customer = await tx.loyaltyCustomer.findFirst({
      where: {
        id: loyaltyCustomerId,
        shop,
      },
    });

    if (!customer) {
      throw new Error(
        "The Paw Perks customer is no longer available.",
      );
    }

    const deduction =
      await tx.loyaltyCustomer.updateMany({
        where: {
          id: customer.id,
          shop,
          pointsBalance: {
            gte: reward.pointsRequired,
          },
        },
        data: {
          pointsBalance: {
            decrement: reward.pointsRequired,
          },
        },
      });

    if (deduction.count !== 1) {
      throw new Error(
        `The customer needs ${reward.pointsRequired} points to redeem this reward.`,
      );
    }

    const updatedCustomer =
      await tx.loyaltyCustomer.findUniqueOrThrow({
        where: {
          id: customer.id,
        },
      });

    const redeemedAt = new Date();

    const expiresAt =
      reward.expiresInDays &&
      reward.expiresInDays > 0
        ? addDays(redeemedAt, reward.expiresInDays)
        : null;

    const redemption =
      await tx.rewardRedemption.create({
        data: {
          shop,
          loyaltyCustomerId: customer.id,
          rewardDefinitionId: reward.id,
          pointsSpent: reward.pointsRequired,
          discountCode,
          status: "PENDING",
          redeemedAt,
          expiresAt,
        },
      });

    await tx.pointTransaction.create({
      data: {
        shop,
        loyaltyCustomerId: customer.id,
        type: "REWARD_REDEMPTION",
        points: -reward.pointsRequired,
        balanceAfter: updatedCustomer.pointsBalance,
        description: `Redeemed ${reward.name}`,
        redemptionId: redemption.id,
        idempotencyKey: `redemption:${shop}:${redemption.id}`,
      },
    });

    return {
      customer: updatedCustomer,
      reward,
      redemption,
      expiresAt,
    };
  });

  const mutation = `#graphql
    mutation CreatePawPerksDiscount(
      $basicCodeDiscount: DiscountCodeBasicInput!
    ) {
      discountCodeBasicCreate(
        basicCodeDiscount: $basicCodeDiscount
      ) {
        codeDiscountNode {
          id
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;

  const basicCodeDiscount: Record<string, unknown> = {
    title: `Paw Perks — ${reservation.reward.name}`,
    code: discountCode,
    startsAt: new Date().toISOString(),

    context: {
      customers: {
        add: [
          customerGid(
            reservation.customer.shopifyCustomerId,
          ),
        ],
      },
    },

    customerGets: {
      value: buildDiscountValue(
        reservation.reward.discountType,
        reservation.reward.discountValue,
      ),
      items: {
        all: true,
      },
    },

    usageLimit: 1,
    appliesOncePerCustomer: true,

    combinesWith: {
      orderDiscounts: false,
      productDiscounts: false,
      shippingDiscounts: false,
    },
  };

  if (reservation.expiresAt) {
    basicCodeDiscount.endsAt =
      reservation.expiresAt.toISOString();
  }

  const minimumRequirement = buildMinimumRequirement(
    reservation.reward.minimumSpend,
  );

  if (minimumRequirement) {
    basicCodeDiscount.minimumRequirement =
      minimumRequirement;
  }

  try {
    const response = await admin.graphql(mutation, {
      variables: {
        basicCodeDiscount,
      },
    });

    const responseJson =
      (await response.json()) as DiscountCreateResponse;

    if (responseJson.errors?.length) {
      throw new Error(
        responseJson.errors
          .map((error) => error.message)
          .join("; "),
      );
    }

    const mutationResult =
      responseJson.data?.discountCodeBasicCreate;

    const userErrors =
      mutationResult?.userErrors ?? [];

    if (userErrors.length > 0) {
      throw new Error(
        userErrors
          .map((error) => {
            const field = error.field?.join(".") ?? "";

            return field
              ? `${field}: ${error.message}`
              : error.message;
          })
          .join("; "),
      );
    }

    const shopifyDiscountId =
      mutationResult?.codeDiscountNode?.id;

    if (!shopifyDiscountId) {
      throw new Error(
        "Shopify did not return a discount ID.",
      );
    }

    const completedRedemption =
      await prisma.rewardRedemption.update({
        where: {
          id: reservation.redemption.id,
        },
        data: {
          shopifyDiscountId,
          status: "ACTIVE",
        },
      });

    return {
      status: "active",
      redemptionId: completedRedemption.id,
      discountCode:
        completedRedemption.discountCode,
      shopifyDiscountId,
      pointsSpent:
        completedRedemption.pointsSpent,
      balanceAfter:
        reservation.customer.pointsBalance,
      expiresAt:
        completedRedemption.expiresAt,
    };
  } catch (error) {
    /*
     * Shopify rejected the discount or the API call failed.
     * Restore the points and mark the redemption cancelled.
     */
    await prisma.$transaction(async (tx) => {
      const currentRedemption =
        await tx.rewardRedemption.findUnique({
          where: {
            id: reservation.redemption.id,
          },
        });

      if (
        !currentRedemption ||
        currentRedemption.status !== "PENDING"
      ) {
        return;
      }

      const restoredCustomer =
        await tx.loyaltyCustomer.update({
          where: {
            id: reservation.customer.id,
          },
          data: {
            pointsBalance: {
              increment:
                reservation.reward.pointsRequired,
            },
          },
        });

      await tx.rewardRedemption.update({
        where: {
          id: reservation.redemption.id,
        },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
        },
      });

      await tx.pointTransaction.create({
        data: {
          shop,
          loyaltyCustomerId:
            reservation.customer.id,
          type: "REDEMPTION_ROLLBACK",
          points:
            reservation.reward.pointsRequired,
          balanceAfter:
            restoredCustomer.pointsBalance,
          description:
            `Restored points because ${reservation.reward.name} could not be created`,
          redemptionId:
            reservation.redemption.id,
          idempotencyKey:
            `redemption-rollback:${shop}:${reservation.redemption.id}`,
        },
      });
    });

    throw error;
  }
}