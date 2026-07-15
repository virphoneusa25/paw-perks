import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const settings = await prisma.loyaltySettings.upsert({
    where: { shop },
    update: {},
    create: {
      shop,
      programName: "Paw Perks",
      pointsPerSpendCents: 200,
      pointsPerUnit: 1,
      signupBonusPoints: 0,
      birthdayBonusPoints: 0,
      referralBonusPoints: 0,
      excludeTaxes: true,
      excludeShipping: true,
      excludeGiftCards: true,
      allowNegativeBalance: false,
      isEnabled: true,
    },
  });

  const defaultRewards = [
    {
      key: "FIVE_OFF",
      name: "$5 Off",
      description:
        "Redeem 100 Paw Points for $5 off an eligible purchase.",
      pointsRequired: 100,
      discountType: "FIXED_AMOUNT",
      discountValue: 500,
      sortOrder: 1,
    },
    {
      key: "TEN_OFF",
      name: "$10 Off",
      description:
        "Redeem 200 Paw Points for $10 off an eligible purchase.",
      pointsRequired: 200,
      discountType: "FIXED_AMOUNT",
      discountValue: 1000,
      sortOrder: 2,
    },
    {
      key: "TWENTY_FIVE_OFF",
      name: "$25 Off",
      description:
        "Redeem 500 Paw Points for $25 off an eligible purchase.",
      pointsRequired: 500,
      discountType: "FIXED_AMOUNT",
      discountValue: 2500,
      sortOrder: 3,
    },
  ];

  for (const reward of defaultRewards) {
    await prisma.rewardDefinition.upsert({
      where: {
        shop_key: {
          shop,
          key: reward.key,
        },
      },
      update: {},
      create: {
        shop,
        ...reward,
        isActive: true,
      },
    });
  }

  const [
    totalMembers,
    totalTransactions,
    totalRewards,
    pointsIssued,
    recentTransactions,
  ] = await Promise.all([
    prisma.loyaltyCustomer.count({
      where: { shop },
    }),

    prisma.pointTransaction.count({
      where: { shop },
    }),

    prisma.rewardDefinition.count({
      where: {
        shop,
        isActive: true,
      },
    }),

    prisma.pointTransaction.aggregate({
      where: {
        shop,
        points: {
          gt: 0,
        },
      },
      _sum: {
        points: true,
      },
    }),

    prisma.pointTransaction.findMany({
      where: { shop },
      orderBy: {
        createdAt: "desc",
      },
      take: 8,
      include: {
        customer: true,
      },
    }),
  ]);

  return {
    shop,
    settings,
    metrics: {
      totalMembers,
      totalTransactions,
      totalRewards,
      pointsIssued: pointsIssued._sum.points ?? 0,
    },
    recentTransactions: recentTransactions.map((transaction) => ({
      id: transaction.id,
      customerName:
        [transaction.customer.firstName, transaction.customer.lastName]
          .filter(Boolean)
          .join(" ") ||
        transaction.customer.email ||
        "Customer",
      type: transaction.type,
      points: transaction.points,
      description: transaction.description,
      createdAt: transaction.createdAt.toISOString(),
    })),
  };
}

export default function PawPerksDashboard() {
  const { settings, metrics, recentTransactions } =
    useLoaderData<typeof loader>();

  return (
    <s-page heading="Paw Perks">
      <s-button slot="primary-action" variant="primary" href="/app/manage">
        Manage program
      </s-button>

      <s-section>
        <s-grid
          gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))"
          gap="base"
        >
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-text type="strong">Program status</s-text>

            <s-heading>
              {settings.isEnabled ? "Active" : "Paused"}
            </s-heading>

            <s-text color="subdued">
              {settings.programName} is ready for customers.
            </s-text>
          </s-box>

          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-text type="strong">Members</s-text>

            <s-heading>{metrics.totalMembers}</s-heading>

            <s-text color="subdued">
              Enrolled Paw Perks customers
            </s-text>
          </s-box>

          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-text type="strong">Points issued</s-text>

            <s-heading>{metrics.pointsIssued}</s-heading>

            <s-text color="subdued">
              Total positive Paw Points awarded
            </s-text>
          </s-box>

          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-text type="strong">Active rewards</s-text>

            <s-heading>{metrics.totalRewards}</s-heading>

            <s-text color="subdued">
              Rewards available for redemption
            </s-text>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading="Earning rules">
        <s-box
          padding="base"
          borderWidth="base"
          borderRadius="base"
        >
          <s-stack gap="base">
            <s-heading>
              Earn {settings.pointsPerUnit} Paw Point for every $
              {(settings.pointsPerSpendCents / 100).toFixed(2)} spent
            </s-heading>

            <s-text color="subdued">
              Points are calculated from eligible merchandise after
              discounts.
            </s-text>

            <s-grid
              gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))"
              gap="base"
            >
              <s-text>
                Taxes excluded:{" "}
                {settings.excludeTaxes ? "Yes" : "No"}
              </s-text>

              <s-text>
                Shipping excluded:{" "}
                {settings.excludeShipping ? "Yes" : "No"}
              </s-text>

              <s-text>
                Gift cards excluded:{" "}
                {settings.excludeGiftCards ? "Yes" : "No"}
              </s-text>

              <s-text>
                Negative balances:{" "}
                {settings.allowNegativeBalance
                  ? "Allowed"
                  : "Not allowed"}
              </s-text>
            </s-grid>
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="Recent point activity">
        {recentTransactions.length === 0 ? (
          <s-box
            padding="large"
            borderWidth="base"
            borderRadius="base"
          >
            <s-stack gap="base" alignItems="center">
              <s-heading>No point activity yet</s-heading>

              <s-text color="subdued">
                Paid orders, refunds, redemptions, and manual
                adjustments will appear here.
              </s-text>
            </s-stack>
          </s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Customer</s-table-header>
              <s-table-header>Activity</s-table-header>
              <s-table-header>Points</s-table-header>
              <s-table-header>Date</s-table-header>
            </s-table-header-row>

            <s-table-body>
              {recentTransactions.map((transaction) => (
                <s-table-row key={transaction.id}>
                  <s-table-cell>
                    {transaction.customerName}
                  </s-table-cell>

                  <s-table-cell>
                    {transaction.description || transaction.type}
                  </s-table-cell>

                  <s-table-cell>
                    {transaction.points > 0 ? "+" : ""}
                    {transaction.points}
                  </s-table-cell>

                  <s-table-cell>
                    {new Date(
                      transaction.createdAt,
                    ).toLocaleDateString()}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="System status">
        <s-grid
          gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))"
          gap="base"
        >
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
          >
            <s-text type="strong">
              Shopify authentication
            </s-text>

            <s-heading>Connected</s-heading>
          </s-box>

          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
          >
            <s-text type="strong">Loyalty database</s-text>

            <s-heading>Connected</s-heading>
          </s-box>

          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
          >
            <s-text type="strong">
              Point transactions
            </s-text>

            <s-heading>{metrics.totalTransactions}</s-heading>
          </s-box>
        </s-grid>
      </s-section>
    </s-page>
  );
}