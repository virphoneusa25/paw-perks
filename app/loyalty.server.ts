import prisma from "./db.server";

type ShopifyCustomer = {
  id?: number | string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

type ShopifyMoney = {
  amount?: string | number;
  currency_code?: string;
};

type ShopifyMoneySet = {
  shop_money?: ShopifyMoney;
  presentment_money?: ShopifyMoney;
};

type ShopifyDiscountAllocation = {
  amount?: string | number;
  amount_set?: ShopifyMoneySet;
};

type ShopifyLineItem = {
  price?: string | number;
  price_set?: ShopifyMoneySet;
  quantity?: number;
  current_quantity?: number;
  total_discount?: string | number;
  total_discount_set?: ShopifyMoneySet;
  discount_allocations?: ShopifyDiscountAllocation[];
  gift_card?: boolean;
  name?: string;
  title?: string;
};

type ShopifyPaidOrder = {
  id?: number | string;
  name?: string;
  currency?: string;
  processed_at?: string;
  customer?: ShopifyCustomer | null;
  line_items?: ShopifyLineItem[];
};

type ShopifyRefundLineItem = {
  quantity?: number;
  subtotal?: string | number;
  subtotal_set?: ShopifyMoneySet;
  line_item?: ShopifyLineItem;
};

type ShopifyRefundPayload = {
  id?: number | string;
  order_id?: number | string;
  created_at?: string;
  refund_line_items?: ShopifyRefundLineItem[];
};

function moneyToCents(
  value: string | number | null | undefined,
): number {
  const amount =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value ?? "0"));

  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Math.max(0, Math.round(amount * 100));
}

function calculateEligibleSubtotalCents(
  lineItems: ShopifyLineItem[] = [],
): number {
  return lineItems.reduce((total, item) => {
    if (item.gift_card === true) {
      console.log("Paw Perks excluded gift-card line item:", {
        name: item.name ?? item.title,
      });

      return total;
    }

    const quantity = Math.max(
      0,
      Number(item.quantity ?? item.current_quantity ?? 0),
    );

    const unitPrice =
      item.price ??
      item.price_set?.shop_money?.amount ??
      item.price_set?.presentment_money?.amount ??
      0;

    const grossCents = moneyToCents(unitPrice) * quantity;

    const allocationDiscountCents = (
      item.discount_allocations ?? []
    ).reduce((sum, allocation) => {
      const amount =
        allocation.amount ??
        allocation.amount_set?.shop_money?.amount ??
        allocation.amount_set?.presentment_money?.amount ??
        0;

      return sum + moneyToCents(amount);
    }, 0);

    const lineDiscountCents =
      allocationDiscountCents > 0
        ? allocationDiscountCents
        : moneyToCents(
            item.total_discount ??
              item.total_discount_set?.shop_money?.amount ??
              item.total_discount_set?.presentment_money?.amount ??
              0,
          );

    const eligibleLineCents = Math.max(
      0,
      grossCents - lineDiscountCents,
    );

    console.log("Paw Perks line-item calculation:", {
      name: item.name ?? item.title,
      quantity,
      unitPrice,
      grossCents,
      lineDiscountCents,
      eligibleLineCents,
      giftCard: item.gift_card === true,
    });

    return total + eligibleLineCents;
  }, 0);
}

function calculateRefundedSubtotalCents(
  refundLineItems: ShopifyRefundLineItem[] = [],
): number {
  return refundLineItems.reduce((total, refundItem) => {
    const lineItem = refundItem.line_item;

    if (lineItem?.gift_card === true) {
      console.log("Paw Perks excluded refunded gift-card item:", {
        name: lineItem.name ?? lineItem.title,
      });

      return total;
    }

    const quantity = Math.max(
      0,
      Number(refundItem.quantity ?? 0),
    );

    const reportedSubtotal =
      refundItem.subtotal ??
      refundItem.subtotal_set?.shop_money?.amount ??
      refundItem.subtotal_set?.presentment_money?.amount;

    let refundedCents: number;

    if (reportedSubtotal !== undefined && reportedSubtotal !== null) {
      refundedCents = moneyToCents(reportedSubtotal);
    } else {
      const unitPrice =
        lineItem?.price ??
        lineItem?.price_set?.shop_money?.amount ??
        lineItem?.price_set?.presentment_money?.amount ??
        0;

      refundedCents = moneyToCents(unitPrice) * quantity;
    }

    console.log("Paw Perks refund line calculation:", {
      name: lineItem?.name ?? lineItem?.title,
      quantity,
      reportedSubtotal,
      refundedCents,
      giftCard: lineItem?.gift_card === true,
    });

    return total + Math.max(0, refundedCents);
  }, 0);
}

export async function processPaidOrder(
  shop: string,
  payload: ShopifyPaidOrder,
) {
  const shopifyOrderId = String(payload.id ?? "");
  const shopifyCustomerId = String(payload.customer?.id ?? "");

  if (!shopifyOrderId) {
    throw new Error("Paid-order webhook is missing an order ID.");
  }

  if (!shopifyCustomerId) {
    return {
      status: "skipped",
      reason: "Order does not have an attached Shopify customer.",
      pointsAwarded: 0,
    };
  }

  const settings = await prisma.loyaltySettings.upsert({
    where: { shop },
    update: {},
    create: {
      shop,
      programName: "Paw Perks",
      pointsPerSpendCents: 200,
      pointsPerUnit: 1,
      excludeTaxes: true,
      excludeShipping: true,
      excludeGiftCards: true,
      allowNegativeBalance: false,
      isEnabled: true,
    },
  });

  if (!settings.isEnabled) {
    return {
      status: "skipped",
      reason: "Paw Perks is paused.",
      pointsAwarded: 0,
    };
  }

  const idempotencyKey = `order-paid:${shop}:${shopifyOrderId}`;

  const existingTransaction =
    await prisma.pointTransaction.findUnique({
      where: { idempotencyKey },
    });

  if (existingTransaction) {
    return {
      status: "duplicate",
      reason: "This paid order was already processed.",
      pointsAwarded: existingTransaction.points,
    };
  }

  const existingOrder = await prisma.processedOrder.findUnique({
    where: {
      shop_shopifyOrderId: {
        shop,
        shopifyOrderId,
      },
    },
  });

  if (existingOrder) {
    return {
      status: "duplicate",
      reason: "This paid order already exists.",
      pointsAwarded: existingOrder.pointsAwarded,
    };
  }

  console.log("Paw Perks paid-order payload summary:", {
    orderId: shopifyOrderId,
    orderName: payload.name,
    customerId: shopifyCustomerId,
    currency: payload.currency,
    lineItemCount: payload.line_items?.length ?? 0,
    lineItems: payload.line_items,
  });

  const eligibleSubtotalCents =
    calculateEligibleSubtotalCents(payload.line_items);

  const earnedUnits = Math.floor(
    eligibleSubtotalCents / settings.pointsPerSpendCents,
  );

  const pointsAwarded = earnedUnits * settings.pointsPerUnit;

  const result = await prisma.$transaction(async (tx) => {
    const customer = await tx.loyaltyCustomer.upsert({
      where: {
        shop_shopifyCustomerId: {
          shop,
          shopifyCustomerId,
        },
      },
      update: {
        email: payload.customer?.email ?? undefined,
        firstName: payload.customer?.first_name ?? undefined,
        lastName: payload.customer?.last_name ?? undefined,
      },
      create: {
        shop,
        shopifyCustomerId,
        email: payload.customer?.email ?? null,
        firstName: payload.customer?.first_name ?? null,
        lastName: payload.customer?.last_name ?? null,
      },
    });

    const processedOrder = await tx.processedOrder.create({
      data: {
        shop,
        loyaltyCustomerId: customer.id,
        shopifyOrderId,
        shopifyOrderNumber: payload.name ?? null,
        eligibleSubtotal: eligibleSubtotalCents,
        pointsAwarded,
        currencyCode: payload.currency ?? null,
        paidAt: payload.processed_at
          ? new Date(payload.processed_at)
          : new Date(),
      },
    });

    if (pointsAwarded <= 0) {
      return {
        processedOrder,
        balanceAfter: customer.pointsBalance,
      };
    }

    const updatedCustomer = await tx.loyaltyCustomer.update({
      where: { id: customer.id },
      data: {
        pointsBalance: {
          increment: pointsAwarded,
        },
        lifetimePoints: {
          increment: pointsAwarded,
        },
      },
    });

    await tx.pointTransaction.create({
      data: {
        shop,
        loyaltyCustomerId: customer.id,
        type: "ORDER_EARN",
        points: pointsAwarded,
        balanceAfter: updatedCustomer.pointsBalance,
        description: `Points earned from order ${
          payload.name ?? shopifyOrderId
        }`,
        shopifyOrderId,
        idempotencyKey,
      },
    });

    return {
      processedOrder,
      balanceAfter: updatedCustomer.pointsBalance,
    };
  });

  return {
    status: "processed",
    pointsAwarded,
    eligibleSubtotalCents,
    balanceAfter: result.balanceAfter,
  };
}

export async function processRefund(
  shop: string,
  payload: ShopifyRefundPayload,
) {
  const shopifyRefundId = String(payload.id ?? "");
  const shopifyOrderId = String(payload.order_id ?? "");

  if (!shopifyRefundId) {
    throw new Error("Refund webhook is missing a refund ID.");
  }

  if (!shopifyOrderId) {
    throw new Error("Refund webhook is missing an order ID.");
  }

  const existingRefund = await prisma.refundRecord.findUnique({
    where: {
      shop_shopifyRefundId: {
        shop,
        shopifyRefundId,
      },
    },
  });

  if (existingRefund) {
    return {
      status: "duplicate",
      reason: "This refund was already processed.",
      refundedSubtotalCents: existingRefund.refundedSubtotal,
      pointsReversed: existingRefund.pointsReversed,
    };
  }

  const processedOrder = await prisma.processedOrder.findUnique({
    where: {
      shop_shopifyOrderId: {
        shop,
        shopifyOrderId,
      },
    },
  });

  if (!processedOrder) {
    return {
      status: "skipped",
      reason:
        "The original order was not processed by Paw Perks.",
      refundedSubtotalCents: 0,
      pointsReversed: 0,
    };
  }

  const refundedSubtotalCents =
    calculateRefundedSubtotalCents(
      payload.refund_line_items,
    );

  const settings = await prisma.loyaltySettings.findUnique({
    where: { shop },
  });

  if (!settings) {
    throw new Error(
      `Paw Perks settings were not found for ${shop}.`,
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    /*
     * Calculate previous refund totals for this order. Using cumulative
     * refunded merchandise prevents split refunds from losing rounding
     * value. Example: two separate $1 refunds eventually reverse one
     * point under a $2-per-point rule.
     */
    const previousRefunds = await tx.refundRecord.aggregate({
      where: {
        shop,
        processedOrderId: processedOrder.id,
      },
      _sum: {
        refundedSubtotal: true,
        pointsReversed: true,
      },
    });

    const previouslyRefundedSubtotal =
      previousRefunds._sum.refundedSubtotal ?? 0;

    const previouslyReversedPoints =
      previousRefunds._sum.pointsReversed ?? 0;

    const cumulativeRefundedSubtotal =
      previouslyRefundedSubtotal + refundedSubtotalCents;

    const targetReversedPoints = Math.min(
      processedOrder.pointsAwarded,
      Math.floor(
        cumulativeRefundedSubtotal /
          settings.pointsPerSpendCents,
      ) * settings.pointsPerUnit,
    );

    const calculatedPointsToReverse = Math.max(
      0,
      targetReversedPoints - previouslyReversedPoints,
    );

    const customer = await tx.loyaltyCustomer.findUnique({
      where: {
        id: processedOrder.loyaltyCustomerId,
      },
    });

    if (!customer) {
      throw new Error(
        `Loyalty customer ${processedOrder.loyaltyCustomerId} was not found.`,
      );
    }

    /*
     * When negative balances are disabled, never take the customer below
     * zero. When enabled, reverse the full calculated amount.
     */
    const pointsToReverse = settings.allowNegativeBalance
      ? calculatedPointsToReverse
      : Math.min(
          calculatedPointsToReverse,
          customer.pointsBalance,
        );

    let balanceAfter = customer.pointsBalance;

    if (pointsToReverse > 0) {
      const updatedCustomer = await tx.loyaltyCustomer.update({
        where: {
          id: customer.id,
        },
        data: {
          pointsBalance: {
            decrement: pointsToReverse,
          },
        },
      });

      balanceAfter = updatedCustomer.pointsBalance;

      await tx.pointTransaction.create({
        data: {
          shop,
          loyaltyCustomerId: customer.id,
          type: "REFUND_REVERSAL",
          points: -pointsToReverse,
          balanceAfter,
          description: `Points reversed for refund ${shopifyRefundId} on order ${
            processedOrder.shopifyOrderNumber ??
            shopifyOrderId
          }`,
          shopifyOrderId,
          idempotencyKey: `refund:${shop}:${shopifyRefundId}`,
        },
      });
    }

    await tx.refundRecord.create({
      data: {
        shop,
        processedOrderId: processedOrder.id,
        shopifyRefundId,
        refundedSubtotal: refundedSubtotalCents,
        pointsReversed: pointsToReverse,
      },
    });

    return {
      previouslyRefundedSubtotal,
      cumulativeRefundedSubtotal,
      previouslyReversedPoints,
      targetReversedPoints,
      calculatedPointsToReverse,
      pointsReversed: pointsToReverse,
      balanceAfter,
    };
  });

  return {
    status: "processed",
    shopifyRefundId,
    shopifyOrderId,
    refundedSubtotalCents,
    ...result,
  };
}