import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";

import prisma from "../db.server";
import { redeemReward } from "../redemption.server";
import { authenticate } from "../shopify.server";

type ActionData = {
  success?: boolean;
  message?: string;
  error?: string;
  discountCode?: string;
};

function parseWholeNumber(
  value: FormDataEntryValue | null,
): number | null {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function customerName(customer: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  shopifyCustomerId: string;
}): string {
  const fullName = [
    customer.firstName,
    customer.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    fullName ||
    customer.email ||
    `Customer ${customer.shopifyCustomerId}`
  );
}

function rewardValue(
  discountType: string,
  discountValue: number,
): string {
  if (discountType === "PERCENTAGE") {
    return `${discountValue}% off`;
  }

  return `$${(discountValue / 100).toFixed(2)} off`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [customers, rewards, redemptions] =
    await Promise.all([
      prisma.loyaltyCustomer.findMany({
        where: { shop },
        orderBy: [
          { pointsBalance: "desc" },
          { updatedAt: "desc" },
        ],
      }),

      prisma.rewardDefinition.findMany({
        where: {
          shop,
          isActive: true,
        },
        orderBy: [
          { sortOrder: "asc" },
          { pointsRequired: "asc" },
        ],
      }),

      prisma.rewardRedemption.findMany({
        where: { shop },
        orderBy: {
          redeemedAt: "desc",
        },
        take: 25,
        include: {
          customer: true,
          reward: true,
        },
      }),
    ]);

  return {
    customers,
    rewards,
    redemptions,
  };
};

export const action = async ({
  request,
}: ActionFunctionArgs) => {
  const { session, admin } =
    await authenticate.admin(request);

  const shop = session.shop;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  try {
    if (intent === "adjust-points") {
      const loyaltyCustomerId = String(
        formData.get("loyaltyCustomerId") ?? "",
      );

      const points = parseWholeNumber(
        formData.get("points"),
      );

      const description =
        String(formData.get("description") ?? "").trim() ||
        "Manual Paw Points adjustment";

      if (!loyaltyCustomerId) {
        return {
          success: false,
          error: "Select a customer.",
        } satisfies ActionData;
      }

      if (points === null || points === 0) {
        return {
          success: false,
          error:
            "Enter a non-zero whole number of points.",
        } satisfies ActionData;
      }

      const customer =
        await prisma.loyaltyCustomer.findFirst({
          where: {
            id: loyaltyCustomerId,
            shop,
          },
        });

      if (!customer) {
        return {
          success: false,
          error: "Customer not found.",
        } satisfies ActionData;
      }

      const settings =
        await prisma.loyaltySettings.findUnique({
          where: { shop },
        });

      const calculatedBalance =
        customer.pointsBalance + points;

      if (
        calculatedBalance < 0 &&
        !settings?.allowNegativeBalance
      ) {
        return {
          success: false,
          error:
            "This adjustment would create a negative balance.",
        } satisfies ActionData;
      }

      const result = await prisma.$transaction(
        async (tx) => {
          const updatedCustomer =
            await tx.loyaltyCustomer.update({
              where: {
                id: customer.id,
              },
              data: {
                pointsBalance: {
                  increment: points,
                },

                ...(points > 0
                  ? {
                      lifetimePoints: {
                        increment: points,
                      },
                    }
                  : {}),
              },
            });

          await tx.pointTransaction.create({
            data: {
              shop,
              loyaltyCustomerId: customer.id,
              type: "MANUAL_ADJUSTMENT",
              points,
              balanceAfter:
                updatedCustomer.pointsBalance,
              description,
              idempotencyKey:
                `manual:${shop}:${customer.id}:${crypto.randomUUID()}`,
            },
          });

          return updatedCustomer;
        },
      );

      return {
        success: true,
        message:
          `${points > 0 ? "Added" : "Removed"} ` +
          `${Math.abs(points)} points. ` +
          `New balance: ${result.pointsBalance}.`,
      } satisfies ActionData;
    }

    if (intent === "redeem") {
      const loyaltyCustomerId = String(
        formData.get("loyaltyCustomerId") ?? "",
      );

      const rewardDefinitionId = String(
        formData.get("rewardDefinitionId") ?? "",
      );

      if (
        !loyaltyCustomerId ||
        !rewardDefinitionId
      ) {
        return {
          success: false,
          error:
            "Select both a customer and a reward.",
        } satisfies ActionData;
      }

      const result = await redeemReward({
        shop,
        loyaltyCustomerId,
        rewardDefinitionId,
        admin,
      });

      return {
        success: true,
        message:
          `Reward redeemed successfully. ` +
          `${result.pointsSpent} points were deducted.`,
        discountCode: result.discountCode,
      } satisfies ActionData;
    }

    return {
      success: false,
      error: "Unknown customer action.",
    } satisfies ActionData;
  } catch (error) {
    console.error(
      "Paw Perks customer action failed:",
      error,
    );

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "The action could not be completed.",
    } satisfies ActionData;
  }
};

export default function CustomersPage() {
  const {
    customers,
    rewards,
    redemptions,
  } = useLoaderData<typeof loader>();

  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();

  const isSubmitting =
    navigation.state === "submitting";

  return (
    <div className="customers-page">
      <style>{`
        .customers-page {
          width: 100%;
          max-width: 1120px;
          margin: 0 auto;
          padding: 24px 20px 48px;
          box-sizing: border-box;
          color: #202223;
        }

        .page-header {
          margin-bottom: 20px;
        }

        .page-header h1 {
          margin: 0;
          font-size: 24px;
          line-height: 1.3;
        }

        .page-header p {
          margin: 6px 0 0;
          color: #616161;
        }

        .notice {
          margin-bottom: 18px;
          padding: 13px 15px;
          border-radius: 9px;
        }

        .notice--success {
          background: #eaf8f2;
          border: 1px solid #8fd5bb;
          color: #145c43;
        }

        .notice--error {
          background: #fff1f0;
          border: 1px solid #e6a3a0;
          color: #8e1f18;
        }

        .discount-result {
          display: block;
          margin-top: 10px;
          padding: 12px;
          border: 1px dashed #569b7d;
          border-radius: 8px;
          background: #ffffff;
          color: #202223;
          font-size: 18px;
          font-weight: 700;
          letter-spacing: 0.06em;
          overflow-wrap: anywhere;
        }

        .card {
          margin-bottom: 18px;
          padding: 20px;
          background: #ffffff;
          border: 1px solid #dfe3e8;
          border-radius: 14px;
          box-shadow: 0 1px 2px
            rgba(31, 33, 36, 0.08);
        }

        .card h2 {
          margin: 0;
          font-size: 18px;
        }

        .card-intro {
          margin: 6px 0 18px;
          color: #616161;
        }

        .field-grid {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .field {
          display: grid;
          gap: 7px;
        }

        .field--full {
          grid-column: 1 / -1;
        }

        .field label {
          font-weight: 600;
        }

        .field input,
        .field select {
          width: 100%;
          min-height: 42px;
          box-sizing: border-box;
          padding: 9px 11px;
          border: 1px solid #8a8a8a;
          border-radius: 8px;
          background: #ffffff;
          color: #202223;
          font: inherit;
        }

        .help {
          color: #616161;
          font-size: 13px;
          line-height: 1.4;
        }

        .button {
          margin-top: 17px;
          padding: 10px 17px;
          border: 1px solid #303030;
          border-radius: 8px;
          background: #303030;
          color: #ffffff;
          font: inherit;
          font-weight: 650;
          cursor: pointer;
        }

        .button:disabled {
          cursor: wait;
          opacity: 0.65;
        }

        .members {
          display: grid;
          gap: 12px;
        }

        .member {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 15px;
          border: 1px solid #dfe3e8;
          border-radius: 10px;
        }

        .member strong {
          display: block;
        }

        .member span {
          display: block;
          margin-top: 3px;
          color: #616161;
          font-size: 13px;
        }

        .balance {
          flex: 0 0 auto;
          padding: 6px 10px;
          border-radius: 999px;
          background: #eaf8f2;
          color: #145c43;
          font-weight: 700;
        }

        .table-wrap {
          overflow-x: auto;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        th,
        td {
          padding: 12px 10px;
          border-bottom: 1px solid #e3e3e3;
          text-align: left;
          vertical-align: top;
          white-space: nowrap;
        }

        th {
          color: #616161;
          font-size: 13px;
          font-weight: 650;
        }

        .status {
          display: inline-flex;
          padding: 4px 9px;
          border-radius: 999px;
          background: #f1f1f1;
          font-size: 13px;
        }

        .status--active {
          background: #eaf8f2;
          color: #145c43;
        }

        .status--cancelled {
          background: #fff1f0;
          color: #8e1f18;
        }

        .empty {
          padding: 28px 16px;
          border: 1px dashed #b7b7b7;
          border-radius: 10px;
          text-align: center;
          color: #616161;
        }

        @media (max-width: 760px) {
          .field-grid {
            grid-template-columns: 1fr;
          }

          .member {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>

      <header className="page-header">
        <h1>Customers & redemptions</h1>
        <p>
          Manage member balances and issue Paw Perks
          rewards.
        </p>
      </header>

      {actionData?.success ? (
        <div className="notice notice--success">
          {actionData.message ??
            "The action completed successfully."}

          {actionData.discountCode ? (
            <code className="discount-result">
              {actionData.discountCode}
            </code>
          ) : null}
        </div>
      ) : null}

      {actionData?.error ? (
        <div className="notice notice--error">
          {actionData.error}
        </div>
      ) : null}

      <section className="card">
        <h2>Manual points adjustment</h2>
        <p className="card-intro">
          Use positive numbers to add points and negative
          numbers to remove points.
        </p>

        {customers.length === 0 ? (
          <div className="empty">
            No Paw Perks members are available.
          </div>
        ) : (
          <Form method="post">
            <input
              type="hidden"
              name="intent"
              value="adjust-points"
            />

            <div className="field-grid">
              <div className="field">
                <label htmlFor="adjust-customer">
                  Customer
                </label>

                <select
                  id="adjust-customer"
                  name="loyaltyCustomerId"
                  required
                >
                  <option value="">
                    Select customer
                  </option>

                  {customers.map((customer) => (
                    <option
                      key={customer.id}
                      value={customer.id}
                    >
                      {customerName(customer)} —{" "}
                      {customer.pointsBalance} points
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="adjust-points">
                  Points
                </label>

                <input
                  id="adjust-points"
                  name="points"
                  type="number"
                  step="1"
                  placeholder="Example: 100 or -25"
                  required
                />
              </div>

              <div className="field field--full">
                <label htmlFor="adjust-description">
                  Reason
                </label>

                <input
                  id="adjust-description"
                  name="description"
                  type="text"
                  placeholder="Customer service adjustment"
                />
              </div>
            </div>

            <button
              className="button"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? "Saving…"
                : "Adjust points"}
            </button>
          </Form>
        )}
      </section>

      <section className="card">
        <h2>Redeem reward</h2>
        <p className="card-intro">
          This creates a real Shopify discount code and
          deducts the reward’s points.
        </p>

        {customers.length === 0 ||
        rewards.length === 0 ? (
          <div className="empty">
            At least one member and one active reward are
            required.
          </div>
        ) : (
          <Form method="post">
            <input
              type="hidden"
              name="intent"
              value="redeem"
            />

            <div className="field-grid">
              <div className="field">
                <label htmlFor="redeem-customer">
                  Customer
                </label>

                <select
                  id="redeem-customer"
                  name="loyaltyCustomerId"
                  required
                >
                  <option value="">
                    Select customer
                  </option>

                  {customers.map((customer) => (
                    <option
                      key={customer.id}
                      value={customer.id}
                    >
                      {customerName(customer)} —{" "}
                      {customer.pointsBalance} points
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="redeem-reward">
                  Reward
                </label>

                <select
                  id="redeem-reward"
                  name="rewardDefinitionId"
                  required
                >
                  <option value="">
                    Select reward
                  </option>

                  {rewards.map((reward) => (
                    <option
                      key={reward.id}
                      value={reward.id}
                    >
                      {reward.name} —{" "}
                      {reward.pointsRequired} points —{" "}
                      {rewardValue(
                        reward.discountType,
                        reward.discountValue,
                      )}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              className="button"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? "Creating discount…"
                : "Redeem reward"}
            </button>
          </Form>
        )}
      </section>

      <section className="card">
        <h2>Members</h2>
        <p className="card-intro">
          Current customers enrolled in Paw Perks.
        </p>

        {customers.length === 0 ? (
          <div className="empty">
            No members have enrolled yet.
          </div>
        ) : (
          <div className="members">
            {customers.map((customer) => (
              <article
                className="member"
                key={customer.id}
              >
                <div>
                  <strong>
                    {customerName(customer)}
                  </strong>

                  <span>
                    {customer.email ??
                      `Shopify customer ${customer.shopifyCustomerId}`}
                  </span>

                  <span>
                    Lifetime points:{" "}
                    {customer.lifetimePoints}
                  </span>
                </div>

                <div className="balance">
                  {customer.pointsBalance} points
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Recent redemptions</h2>
        <p className="card-intro">
          The most recent reward redemption attempts.
        </p>

        {redemptions.length === 0 ? (
          <div className="empty">
            No rewards have been redeemed yet.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Reward</th>
                  <th>Points</th>
                  <th>Code</th>
                  <th>Status</th>
                  <th>Redeemed</th>
                </tr>
              </thead>

              <tbody>
                {redemptions.map((redemption) => (
                  <tr key={redemption.id}>
                    <td>
                      {customerName(
                        redemption.customer,
                      )}
                    </td>

                    <td>
                      {redemption.reward.name}
                    </td>

                    <td>
                      {redemption.pointsSpent}
                    </td>

                    <td>
                      <code>
                        {redemption.discountCode}
                      </code>
                    </td>

                    <td>
                      <span
                        className={
                          redemption.status === "ACTIVE"
                            ? "status status--active"
                            : redemption.status ===
                                "CANCELLED"
                              ? "status status--cancelled"
                              : "status"
                        }
                      >
                        {redemption.status}
                      </span>
                    </td>

                    <td>
                      {new Date(
                        redemption.redeemedAt,
                      ).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}