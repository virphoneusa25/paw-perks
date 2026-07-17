import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import prisma from "../db.server";
import { redeemReward } from "../redemption.server";
import { authenticate } from "../shopify.server";
import {
  createCustomerAddress,
  deleteCustomerAddress,
  setDefaultCustomerAddress,
  updateCustomerAddress,
  updateCustomerProfile,
} from "../customer-account.server";

const PAWMART_LOGO_URL =
  "https://cdn.shopify.com/s/files/1/0673/2519/8399/files/image1.png?v=1784153296";

const PAWMART_ACCOUNT_HERO_URL = "";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value: Date | null): string {
  if (!value) {
    return "No expiration";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

function formatDiscount(
  discountType: string,
  discountValue: number,
): string {
  if (discountType === "PERCENTAGE") {
    return `${discountValue}% off`;
  }

  return `$${(discountValue / 100).toFixed(2)} off`;
}

function customerName(customer: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}): string {
  const name = [
    customer.firstName,
    customer.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return name || customer.email || "Paw Perks member";
}

function portalUrl(
  shop: string,
  params?: Record<string, string>,
): string {
  const url = new URL(
    `https://${shop}/apps/paw-perks`,
  );

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

export const action = async ({
  request,
}: ActionFunctionArgs) => {
  const proxyContext =
      await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") ?? "";
  const loggedInCustomerId =
    url.searchParams.get("logged_in_customer_id") ?? "";

  if (!shop) {
    return new Response("Missing shop.", {
      status: 400,
    });
  }

  if (!loggedInCustomerId) {
    return Response.redirect(
      portalUrl(shop, {
        error:
          "Please sign in to redeem Paw Perks rewards.",
      }),
      303,
    );
  }

  if (!proxyContext.admin) {
    return Response.redirect(
      portalUrl(shop, {
        error:
          "Paw Perks could not connect to Shopify.",
      }),
      303,
    );
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  const customerGid =
    `gid://shopify/Customer/${loggedInCustomerId}`;

  try {
    if (intent === "update-profile") {
      const firstName = String(
        formData.get("firstName") ?? "",
      ).trim();
      const lastName = String(
        formData.get("lastName") ?? "",
      ).trim();
      const email = String(
        formData.get("email") ?? "",
      ).trim();

      if (!firstName) {
        throw new Error("First name is required.");
      }

      if (!email) {
        throw new Error("Email address is required.");
      }

      await updateCustomerProfile({
        admin: proxyContext.admin,
        customerId: customerGid,
        firstName,
        lastName,
        email,
      });

      await prisma.loyaltyCustomer.update({
        where: {
          shop_shopifyCustomerId: {
            shop,
            shopifyCustomerId:
              loggedInCustomerId,
          },
        },
        data: {
          firstName,
          lastName,
          email,
        },
      });

      return Response.redirect(
        portalUrl(shop, {
          success: "Profile updated successfully.",
          tab: "account",
        }),
        303,
      );
    }

    if (intent === "create-address") {
      await createCustomerAddress({
        admin: proxyContext.admin,
        customerId: customerGid,
        address: {
          firstName: String(
            formData.get("firstName") ?? "",
          ).trim(),
          lastName: String(
            formData.get("lastName") ?? "",
          ).trim(),
          company: String(
            formData.get("company") ?? "",
          ).trim(),
          address1: String(
            formData.get("address1") ?? "",
          ).trim(),
          address2: String(
            formData.get("address2") ?? "",
          ).trim(),
          city: String(
            formData.get("city") ?? "",
          ).trim(),
          provinceCode: String(
            formData.get("provinceCode") ?? "",
          ).trim(),
          countryCode: String(
            formData.get("countryCode") ?? "US",
          ).trim(),
          zip: String(
            formData.get("zip") ?? "",
          ).trim(),
          phone: String(
            formData.get("phone") ?? "",
          ).trim(),
        },
        setAsDefault:
          formData.get("setAsDefault") === "on",
      });

      return Response.redirect(
        portalUrl(shop, {
          success: "Address added successfully.",
          tab: "addresses",
        }),
        303,
      );
    }

    if (intent === "update-address") {
      const addressId = String(
        formData.get("addressId") ?? "",
      );

      if (!addressId) {
        throw new Error("Address ID is missing.");
      }

      await updateCustomerAddress({
        admin: proxyContext.admin,
        customerId: customerGid,
        addressId,
        address: {
          firstName: String(
            formData.get("firstName") ?? "",
          ).trim(),
          lastName: String(
            formData.get("lastName") ?? "",
          ).trim(),
          company: String(
            formData.get("company") ?? "",
          ).trim(),
          address1: String(
            formData.get("address1") ?? "",
          ).trim(),
          address2: String(
            formData.get("address2") ?? "",
          ).trim(),
          city: String(
            formData.get("city") ?? "",
          ).trim(),
          provinceCode: String(
            formData.get("provinceCode") ?? "",
          ).trim(),
          countryCode: String(
            formData.get("countryCode") ?? "US",
          ).trim(),
          zip: String(
            formData.get("zip") ?? "",
          ).trim(),
          phone: String(
            formData.get("phone") ?? "",
          ).trim(),
        },
        setAsDefault:
          formData.get("setAsDefault") === "on",
      });

      return Response.redirect(
        portalUrl(shop, {
          success: "Address updated successfully.",
          tab: "addresses",
        }),
        303,
      );
    }

    if (intent === "delete-address") {
      const addressId = String(
        formData.get("addressId") ?? "",
      );

      if (!addressId) {
        throw new Error("Address ID is missing.");
      }

      await deleteCustomerAddress({
        admin: proxyContext.admin,
        customerId: customerGid,
        addressId,
      });

      return Response.redirect(
        portalUrl(shop, {
          success: "Address deleted.",
          tab: "addresses",
        }),
        303,
      );
    }

    if (intent === "set-default-address") {
      const addressId = String(
        formData.get("addressId") ?? "",
      );

      if (!addressId) {
        throw new Error("Address ID is missing.");
      }

      await setDefaultCustomerAddress({
        admin: proxyContext.admin,
        customerId: customerGid,
        addressId,
      });

      return Response.redirect(
        portalUrl(shop, {
          success: "Default address updated.",
          tab: "addresses",
        }),
        303,
      );
    }
  } catch (error) {
    console.error(
      "Paw Perks account update failed:",
      error,
    );

    return Response.redirect(
      portalUrl(shop, {
        error:
          error instanceof Error
            ? error.message
            : "The account could not be updated.",
        tab:
          intent.includes("address")
            ? "addresses"
            : "account",
      }),
      303,
    );
  }

  const rewardDefinitionId = String(
    formData.get("rewardDefinitionId") ?? "",
  );

  if (!rewardDefinitionId) {
    return Response.redirect(
      portalUrl(shop, {
        error: "Select a valid reward.",
      }),
      303,
    );
  }

  const customer =
    await prisma.loyaltyCustomer.findUnique({
      where: {
        shop_shopifyCustomerId: {
          shop,
          shopifyCustomerId:
            loggedInCustomerId,
        },
      },
    });

  if (!customer) {
    return Response.redirect(
      portalUrl(shop, {
        error:
          "Your Paw Perks membership could not be found.",
      }),
      303,
    );
  }

  try {
    const result = await redeemReward({
      shop,
      loyaltyCustomerId: customer.id,
      rewardDefinitionId,
      admin: proxyContext.admin,
    });

    return Response.redirect(
      portalUrl(shop, {
        success:
          "Reward redeemed successfully.",
        code: result.discountCode,
      }),
      303,
    );
  } catch (error) {
    console.error(
      "Paw Perks storefront redemption failed:",
      error,
    );

    return Response.redirect(
      portalUrl(shop, {
        error:
          error instanceof Error
            ? error.message
            : "The reward could not be redeemed.",
      }),
      303,
    );
  }
};

export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  const proxyContext =
    await authenticate.public.appProxy(request);

  const url = new URL(request.url);

  const shop = url.searchParams.get("shop") ?? "";
  const loggedInCustomerId =
    url.searchParams.get("logged_in_customer_id") ?? "";

  const successMessage =
    url.searchParams.get("success") ?? "";

  const errorMessage =
    url.searchParams.get("error") ?? "";

  const redeemedCode =
    url.searchParams.get("code") ?? "";

  const requestedTab =
    url.searchParams.get("tab") ?? "";

  if (!shop) {
    return new Response("Missing shop.", {
      status: 400,
    });
  }

  if (!loggedInCustomerId) {
    const html = renderSignedOutPage({
      shop,
      errorMessage,
    });

    return proxyContext.liquid(html, {
      layout: true,
      status: 200,
      headers: {
        "Cache-Control":
          "no-store, no-cache, must-revalidate",
      },
    });
  }

  let customer =
    await prisma.loyaltyCustomer.findUnique({
      where: {
        shop_shopifyCustomerId: {
          shop,
          shopifyCustomerId:
            loggedInCustomerId,
        },
      },
      include: {
        transactions: {
          orderBy: {
            createdAt: "desc",
          },
          take: 20,
        },
        redemptions: {
          orderBy: {
            redeemedAt: "desc",
          },
          take: 20,
          include: {
            reward: true,
          },
        },
      },
    });

  if (!customer) {
    if (!proxyContext.admin) {
      const html = renderMissingMemberPage({
        shop,
        loggedInCustomerId,
      });

      return proxyContext.liquid(html, {
        layout: true,
        status: 200,
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
        },
      });
    }

    try {
      const customerGid =
        `gid://shopify/Customer/${loggedInCustomerId}`;

      const response =
        await proxyContext.admin.graphql(
          `#graphql
            query PawPerksStorefrontCustomer(
              $id: ID!
            ) {
              customer(id: $id) {
                id
                email
                firstName
                lastName
              }
            }
          `,
          {
            variables: {
              id: customerGid,
            },
          },
        );

      const result = (await response.json()) as {
        data?: {
          customer?: {
            id: string;
            email: string | null;
            firstName: string | null;
            lastName: string | null;
          } | null;
        };
        errors?: Array<{
          message: string;
        }>;
      };

      const shopifyCustomer =
        result.data?.customer;

      if (!shopifyCustomer) {
        throw new Error(
          result.errors?.[0]?.message ??
            "Shopify customer could not be loaded.",
        );
      }

      await prisma.loyaltyCustomer.upsert({
        where: {
          shop_shopifyCustomerId: {
            shop,
            shopifyCustomerId:
              loggedInCustomerId,
          },
        },
        update: {
          email: shopifyCustomer.email,
          firstName:
            shopifyCustomer.firstName,
          lastName:
            shopifyCustomer.lastName,
        },
        create: {
          shop,
          shopifyCustomerId:
            loggedInCustomerId,
          email: shopifyCustomer.email,
          firstName:
            shopifyCustomer.firstName,
          lastName:
            shopifyCustomer.lastName,
        },
      });

      customer =
        await prisma.loyaltyCustomer.findUnique({
          where: {
            shop_shopifyCustomerId: {
              shop,
              shopifyCustomerId:
                loggedInCustomerId,
            },
          },
          include: {
            transactions: {
              orderBy: {
                createdAt: "desc",
              },
              take: 20,
            },
            redemptions: {
              orderBy: {
                redeemedAt: "desc",
              },
              take: 20,
              include: {
                reward: true,
              },
            },
          },
        });
    } catch (error) {
      console.error(
        "Paw Perks automatic enrollment failed:",
        error,
      );

      const html = renderMissingMemberPage({
        shop,
        loggedInCustomerId,
      });

      return proxyContext.liquid(html, {
        layout: true,
        status: 200,
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
        },
      });
    }
  }

  if (!customer) {
    return new Response(
      "Paw Perks customer profile could not be created.",
      {
        status: 500,
      },
    );
  }

  if (proxyContext.admin) {
    try {
      const profileResponse =
        await proxyContext.admin.graphql(
          `#graphql
            query PawPerksCustomerProfile(
              $id: ID!
            ) {
              customer(id: $id) {
                email
                firstName
                lastName
              }
            }
          `,
          {
            variables: {
              id:
                `gid://shopify/Customer/${loggedInCustomerId}`,
            },
          },
        );

      const profileResult =
        (await profileResponse.json()) as {
          data?: {
            customer?: {
              email: string | null;
              firstName: string | null;
              lastName: string | null;
            } | null;
          };
        };

      const currentShopifyCustomer =
        profileResult.data?.customer;

      if (currentShopifyCustomer) {
        const updatedProfile =
          await prisma.loyaltyCustomer.update({
            where: {
              shop_shopifyCustomerId: {
                shop,
                shopifyCustomerId:
                  loggedInCustomerId,
              },
            },
            data: {
              email:
                currentShopifyCustomer.email,
              firstName:
                currentShopifyCustomer.firstName,
              lastName:
                currentShopifyCustomer.lastName,
            },
          });

        customer = {
          ...customer,
          email: updatedProfile.email,
          firstName:
            updatedProfile.firstName,
          lastName:
            updatedProfile.lastName,
        };
      }
    } catch (error) {
      console.error(
        "Paw Perks customer profile refresh failed:",
        error,
      );
    }
  }

  let dashboardData: {
    orders: Array<{
      id: string;
      name: string;
      createdAt: string;
      fulfillmentStatus: string;
      financialStatus: string;
      total: string;
      currencyCode: string;
      productTitle: string;
      productImage: string | null;
    }>;
    addresses: Array<{
      id: string;
      name: string;
      firstName: string;
      lastName: string;
      company: string;
      address1: string;
      address2: string;
      city: string;
      province: string;
      zip: string;
      country: string;
      phone: string;
      isDefault: boolean;
    }>;
  } = {
    orders: [],
    addresses: [],
  };

  if (proxyContext.admin) {
    try {
      const dashboardResponse =
        await proxyContext.admin.graphql(
          `#graphql
            query PawPerksCustomerDashboard(
              $id: ID!
            ) {
              customer(id: $id) {
                defaultAddress {
                  id
                }
                addressesV2(first: 10) {
                  nodes {
                    id
                    firstName
                    lastName
                    company
                    address1
                    address2
                    city
                    province
                    zip
                    country
                    phone
                  }
                }
                orders(
                  first: 10
                  sortKey: CREATED_AT
                  reverse: true
                ) {
                  nodes {
                    id
                    name
                    createdAt
                    displayFinancialStatus
                    displayFulfillmentStatus
                    currentTotalPriceSet {
                      shopMoney {
                        amount
                        currencyCode
                      }
                    }
                    lineItems(first: 1) {
                      nodes {
                        title
                        image {
                          url
                        }
                      }
                    }
                  }
                }
              }
            }
          `,
          {
            variables: {
              id:
                `gid://shopify/Customer/${loggedInCustomerId}`,
            },
          },
        );

      const dashboardResult =
        (await dashboardResponse.json()) as {
          data?: {
            customer?: {
              defaultAddress?: {
                id: string;
              } | null;
              addressesV2?: {
                nodes: Array<{
                  id: string;
                  firstName?: string | null;
                  lastName?: string | null;
                  company?: string | null;
                  address1?: string | null;
                  address2?: string | null;
                  city?: string | null;
                  province?: string | null;
                  zip?: string | null;
                  country?: string | null;
                  phone?: string | null;
                }>;
              };
              orders?: {
                nodes: Array<{
                  id: string;
                  name: string;
                  createdAt: string;
                  displayFinancialStatus?: string | null;
                  displayFulfillmentStatus?: string | null;
                  currentTotalPriceSet?: {
                    shopMoney?: {
                      amount: string;
                      currencyCode: string;
                    };
                  };
                  lineItems?: {
                    nodes: Array<{
                      title: string;
                      image?: {
                        url: string;
                      } | null;
                    }>;
                  };
                }>;
              };
            } | null;
          };
        };

      const shopifyDashboardCustomer =
        dashboardResult.data?.customer;

      const defaultAddressId =
        shopifyDashboardCustomer?.defaultAddress?.id ??
        "";

      dashboardData = {
        orders:
          shopifyDashboardCustomer?.orders?.nodes.map(
            (order) => ({
              id: order.id,
              name: order.name,
              createdAt: order.createdAt,
              fulfillmentStatus:
                order.displayFulfillmentStatus ??
                "UNFULFILLED",
              financialStatus:
                order.displayFinancialStatus ??
                "PENDING",
              total:
                order.currentTotalPriceSet
                  ?.shopMoney?.amount ?? "0.00",
              currencyCode:
                order.currentTotalPriceSet
                  ?.shopMoney?.currencyCode ?? "USD",
              productTitle:
                order.lineItems?.nodes[0]?.title ??
                "PawMart order",
              productImage:
                order.lineItems?.nodes[0]?.image?.url ??
                null,
            }),
          ) ?? [],
        addresses:
          shopifyDashboardCustomer?.addressesV2?.nodes.map(
            (address) => ({
              id: address.id,
              name:
                [
                  address.firstName,
                  address.lastName,
                ]
                  .filter(Boolean)
                  .join(" ") ||
                address.company ||
                "Saved address",
              firstName: address.firstName ?? "",
              lastName: address.lastName ?? "",
              company: address.company ?? "",
              address1: address.address1 ?? "",
              address2: address.address2 ?? "",
              city: address.city ?? "",
              province: address.province ?? "",
              zip: address.zip ?? "",
              country: address.country ?? "",
              phone: address.phone ?? "",
              isDefault:
                address.id === defaultAddressId,
            }),
          ) ?? [],
      };
    } catch (error) {
      console.error(
        "Paw Perks dashboard data load failed:",
        error,
      );
    }
  }

  const rewards =
    await prisma.rewardDefinition.findMany({
      where: {
        shop,
        isActive: true,
      },
      orderBy: [
        {
          sortOrder: "asc",
        },
        {
          pointsRequired: "asc",
        },
      ],
    });

  const activeRedemptions =
    customer.redemptions.filter(
      (
        redemption: {
          status: string;
          expiresAt: Date | null;
        },
      ) =>
        redemption.status === "ACTIVE" &&
        (!redemption.expiresAt ||
          redemption.expiresAt > new Date()),
    );

  const html = renderPortal({
    shop,
    customer,
    rewards,
    activeRedemptions,
    successMessage,
    errorMessage,
    redeemedCode,
    requestedTab,
    dashboardData,
  });

  return proxyContext.liquid(html, {
    layout: true,
    status: 200,
    headers: {
      "Cache-Control":
        "no-store, no-cache, must-revalidate",
    },
  });
};

function pageShell(
  content: string,
  shop = "",
): string {
  const storeUrl = shop
    ? `https://${escapeHtml(shop)}`
    : "#";

  return `<style>
      .paw-perks-theme-page {
        display: block;
        width: 100%;
      }

      .paw-perks-theme-page .site-header,
      .paw-perks-theme-page .top-announcement,
      .paw-perks-theme-page .site-footer,
      .paw-perks-theme-page .header-actions {
        display: none !important;
      }

      :root {
        --paw-navy: #06233f;
        --paw-navy-soft: #29445e;
        --paw-teal: #10b8ae;
        --paw-teal-dark: #07978f;
        --paw-aqua: #dff8f6;
        --paw-aqua-soft: #effbfa;
        --paw-blue-soft: #eef8fb;
        --paw-white: #ffffff;
        --paw-background: #f7fbfc;
        --paw-border: #dce8ec;
        --paw-muted: #637589;
        --paw-success: #07978f;
        --paw-warning: #9b5b12;
        --paw-warning-bg: #fff5e7;
        --paw-shadow: 0 10px 35px rgba(6, 35, 63, 0.08);
      }

      .paw-perks-theme-page,
      .paw-perks-theme-page * {
        box-sizing: border-box;
      }

      .paw-perks-theme-page {
        scroll-behavior: smooth;
      }

      .paw-perks-theme-page {
        margin: 0 auto;
        min-height: 0;
        color: var(--paw-navy);
        background:
          radial-gradient(
            circle at top right,
            rgba(245, 166, 35, 0.15),
            transparent 34%
          ),
          linear-gradient(
            180deg,
            #fdf9f1 0,
            #f6f3ed 460px,
            #f4f4f2 100%
          );
        font-family:
          Inter,
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif;
      }

      .paw-perks-theme-page button,
      .paw-perks-theme-page input,
      .paw-perks-theme-page select {
        font: inherit;
      }

      .paw-perks-theme-page a {
        color: inherit;
      }

      .top-announcement {
        background: var(--paw-navy);
        color: var(--paw-blue-soft);
        text-align: center;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
      }

      .site-header {
        position: sticky;
        top: 0;
        z-index: 30;
        background: var(--paw-white);
        border-bottom: 1px solid var(--paw-border);
        box-shadow: 0 2px 8px rgba(16,32,48,0.04);
      }

      .site-header__inner {
        width: min(1180px, calc(100% - 36px));
        min-height: 92px;
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
      }

      .brand {
        display: inline-flex;
        align-items: center;
        gap: 13px;
        color: var(--paw-navy);
        text-decoration: none;
      }

      .brand__logo {
        display: block;
        width: 250px;
        max-width: 250px;
        height: 72px;
        object-fit: contain;
        object-position: left center;
      }

      .brand__fallback {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 20px;
        font-weight: 900;
        color: var(--paw-navy);
      }

      .brand__paw {
        display: inline-flex;
        width: 48px;
        height: 48px;
        align-items: center;
        justify-content: center;
      }

      .header-actions {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .header-link {
        display: inline-flex;
        min-height: 42px;
        align-items: center;
        justify-content: center;
        padding: 9px 15px;
        border:
          1px solid rgba(255, 255, 255, 0.18);
        border-radius: 999px;
        color: #ffffff;
        font-size: 14px;
        font-weight: 750;
        text-decoration: none;
        transition:
          transform 150ms ease,
          border-color 150ms ease,
          background 150ms ease;
      }

      .header-link:hover {
        transform: translateY(-1px);
        border-color: var(--paw-teal);
        background:
          rgba(245, 166, 35, 0.1);
      }

      .page-shell {
        width: min(1180px, calc(100% - 36px));
        margin: 0 auto;
        padding: 34px 0 70px;
      }

      .portal-hero {
        position: relative;
        overflow: hidden;
        padding: 42px;
        border:
          1px solid rgba(255, 255, 255, 0.08);
        border-radius: 28px;
        background:
          linear-gradient(
            135deg,
            var(--paw-navy) 0%,
            var(--paw-navy-soft) 52%,
            #174660 100%
          );
        color: #ffffff;
        box-shadow: var(--paw-shadow);
      }

      /* New light hero layout */
      .portal-hero {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 28px;
        padding: 48px;
        border-radius: 18px;
        background: linear-gradient(180deg, var(--paw-aqua-soft), var(--paw-white));
        box-shadow: var(--paw-shadow);
        border: 1px solid var(--paw-border);
      }

      .hero-content {
        max-width: 680px;
        color: var(--paw-navy);
      }

      .hero-content .eyebrow {
        color: var(--paw-teal);
        background: transparent;
        border: 0;
        padding: 0;
        font-weight: 700;
      }

      .hero-content h1 {
        font-size: 44px;
        margin: 6px 0 6px;
        color: var(--paw-navy);
      }

      .hero-content p {
        color: var(--paw-muted);
        margin: 0;
      }

      .hero-media {
        width: 420px;
        height: 340px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 14px;
        background: linear-gradient(180deg, var(--paw-aqua), var(--paw-aqua-soft));
        position: relative;
      }

      .hero-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 12px;
      }

      .hero-placeholder {
        width: 92%;
        height: 86%;
        border-radius: 10px;
        background: radial-gradient(circle at 20% 20%, rgba(16,184,174,0.08), transparent 30%), linear-gradient(180deg, var(--paw-white), var(--paw-aqua-soft));
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .rewards-summary {
        margin-top: -48px;
        margin-bottom: 18px;
        display: flex;
        justify-content: center;
      }

      .rewards-summary__inner {
        width: min(1180px, calc(100% - 36px));
        background: var(--paw-white);
        border: 1px solid var(--paw-border);
        border-radius: 18px;
        padding: 18px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        box-shadow: var(--paw-shadow);
      }

      .rewards-summary__left {
        display: flex;
        gap: 16px;
        align-items: center;
      }

      .paw-circle {
        width: 74px;
        height: 74px;
        border-radius: 999px;
        background: var(--paw-aqua);
        display: grid;
        place-items: center;
      }

      .rewards-label {
        color: var(--paw-muted);
        font-weight: 700;
      }

      .rewards-balance {
        font-size: 28px;
        font-weight: 900;
        color: var(--paw-teal-dark);
      }

      .rewards-sub {
        color: var(--paw-muted);
      }

      .rewards-summary__right {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
      }

      .account-tabs {
        width: min(1180px, calc(100% - 36px));
        margin: 18px auto 6px;
        display: flex;
        gap: 18px;
        padding: 12px 6px;
        background: var(--paw-white);
        border-radius: 14px;
        border: 1px solid var(--paw-border);
      }

      .account-tabs .tab {
        color: var(--paw-navy);
        text-decoration: none;
        padding: 8px 10px;
        font-weight: 800;
      }

      .account-tabs .tab.active {
        border-bottom: 3px solid var(--paw-teal);
        padding-bottom: 6px;
      }

      /* Code card copy button */
      .code-card__actions {
        margin-top: 10px;
      }

      .copy-btn {
        background: var(--paw-teal);
        color: var(--paw-white);
        border: 0;
        padding: 8px 12px;
        border-radius: 8px;
        font-weight: 800;
        cursor: pointer;
      }

      .portal-hero::before {
        content: "";
        position: absolute;
        width: 330px;
        height: 330px;
        top: -165px;
        right: -70px;
        border-radius: 50%;
        background:
          radial-gradient(
            circle,
            rgba(245, 166, 35, 0.4),
            transparent 68%
          );
      }

      .portal-hero::after {
        content: "\\1F43E";
        position: absolute;
        right: 46px;
        bottom: 18px;
        color:
          rgba(255, 255, 255, 0.055);
        font-size: 170px;
        line-height: 1;
        transform: rotate(-12deg);
      }

      .hero-content {
        position: relative;
        z-index: 2;
        max-width: 720px;
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        margin-bottom: 16px;
        padding: 7px 12px;
        border:
          1px solid rgba(255, 255, 255, 0.15);
        border-radius: 999px;
        background:
          rgba(255, 255, 255, 0.1);
        color: #ffffff;
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0.02em;
      }

      .eyebrow::before {
        content: "\\1F43E";
      }

      .portal-hero h1 {
        margin: 0;
        max-width: 720px;
        font-size: clamp(34px, 6vw, 58px);
        font-weight: 900;
        line-height: 1.04;
        letter-spacing: -0.05em;
      }

      .portal-hero p {
        max-width: 650px;
        margin: 15px 0 0;
        color:
          rgba(255, 255, 255, 0.79);
        font-size: 17px;
        line-height: 1.65;
      }

      .stats {
        position: relative;
        z-index: 2;
        display: grid;
        grid-template-columns:
          repeat(3, minmax(0, 1fr));
        gap: 14px;
        margin-top: 30px;
      }

      .stat {
        min-height: 130px;
        padding: 19px;
        border:
          1px solid rgba(255, 255, 255, 0.14);
        border-radius: 18px;
        background:
          rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(10px);
      }

      .stat--featured {
        border-color:
          rgba(245, 166, 35, 0.55);
        background:
          linear-gradient(
            145deg,
            rgba(245, 166, 35, 0.24),
            rgba(245, 166, 35, 0.1)
          );
      }

      .stat span {
        display: block;
        color:
          rgba(255, 255, 255, 0.69);
        font-size: 13px;
        font-weight: 700;
      }

      .stat strong {
        display: block;
        margin-top: 8px;
        color: #ffffff;
        font-size: clamp(26px, 4vw, 38px);
        font-weight: 900;
        line-height: 1;
        letter-spacing: -0.04em;
      }

      .stat small {
        display: block;
        margin-top: 8px;
        color:
          rgba(255, 255, 255, 0.58);
        font-size: 12px;
      }

      .notice {
        margin-top: 20px;
        padding: 16px 18px;
        border-radius: 15px;
        font-weight: 700;
        box-shadow:
          0 8px 24px rgba(7, 20, 33, 0.06);
      }

      .notice--success {
        border: 1px solid #91d7bd;
        background: var(--paw-aqua-soft);
        color: var(--paw-success);
      }

      .notice--error {
        border: 1px solid #eca9a2;
        background: var(--paw-warning-bg);
        color: var(--paw-warning);
      }

      .new-code {
        display: flex;
        align-items: center;
        justify-content: center;
        margin-top: 12px;
        padding: 15px;
        border:
          2px dashed rgba(23, 107, 77, 0.42);
        border-radius: 12px;
        background: #ffffff;
        color: var(--paw-navy);
        font-size: 20px;
        font-weight: 900;
        letter-spacing: 0.08em;
        overflow-wrap: anywhere;
      }

      .section {
        margin-top: 24px;
        padding: 28px;
        border: 1px solid var(--paw-border);
        border-radius: 22px;
        background:
          rgba(255, 255, 255, 0.94);
        box-shadow:
          0 10px 30px rgba(7, 20, 33, 0.07);
      }

      .section-head {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 20px;
        margin-bottom: 22px;
      }

      .section-title-wrap {
        display: flex;
        align-items: center;
        gap: 13px;
      }

      .section-icon {
        display: grid;
        width: 44px;
        height: 44px;
        flex: 0 0 auto;
        place-items: center;
        border-radius: 14px;
        background: var(--paw-white);
        color: var(--paw-teal-dark);
        font-size: 21px;
      }

      .section h2 {
        margin: 0;
        color: var(--paw-navy);
        font-size: 23px;
        font-weight: 900;
        letter-spacing: -0.03em;
      }

      .section-copy {
        margin: 5px 0 0;
        color: var(--paw-muted);
        line-height: 1.55;
      }

      .reward-grid {
        display: grid;
        grid-template-columns:
          repeat(3, minmax(0, 1fr));
        gap: 17px;
      }

      .reward {
        position: relative;
        display: flex;
        min-height: 300px;
        overflow: hidden;
        flex-direction: column;
        padding: 22px;
        border: 1px solid var(--paw-border);
        border-radius: 18px;
        background:
          linear-gradient(
            180deg,
            #ffffff 0,
            #fdfaf5 100%
          );
        transition:
          transform 180ms ease,
          box-shadow 180ms ease,
          border-color 180ms ease;
      }

      .reward:hover {
        transform: translateY(-4px);
        border-color:
          rgba(245, 166, 35, 0.65);
        box-shadow:
          0 16px 30px rgba(7, 20, 33, 0.11);
      }

      .reward::after {
        content: "\\1F43E";
        position: absolute;
        right: -12px;
        top: -14px;
        color:
          rgba(245, 166, 35, 0.1);
        font-size: 74px;
        transform: rotate(12deg);
      }

      .reward__value {
        position: relative;
        z-index: 1;
        display: inline-flex;
        width: fit-content;
        padding: 6px 10px;
        border-radius: 999px;
        background: var(--paw-white);
        color: var(--paw-teal-dark);
        font-size: 13px;
        font-weight: 850;
      }

      .reward h3 {
        position: relative;
        z-index: 1;
        margin: 14px 0 0;
        color: var(--paw-navy);
        font-size: 21px;
        font-weight: 900;
        line-height: 1.25;
      }

      .reward p {
        position: relative;
        z-index: 1;
        margin: 10px 0 0;
        color: var(--paw-muted);
        line-height: 1.55;
      }

      .reward__details {
        display: grid;
        gap: 5px;
        margin-top: 15px;
        color: var(--paw-muted);
        font-size: 12px;
      }

      .reward__meta {
        position: relative;
        z-index: 1;
        margin-top: auto;
        padding-top: 20px;
      }

      .reward__points {
        display: flex;
        align-items: center;
        gap: 7px;
        margin-bottom: 12px;
        color: var(--paw-navy);
        font-weight: 850;
      }

      .reward__points::before {
        content: "\\1F43E";
        color: var(--paw-teal-dark);
      }

      .button {
        width: 100%;
        min-height: 46px;
        padding: 11px 16px;
        border: 1px solid var(--paw-teal);
        border-radius: 11px;
        background:
          linear-gradient(
            135deg,
            var(--paw-teal),
            #ffbd47
          );
        color: var(--paw-navy);
        font-weight: 900;
        cursor: pointer;
        box-shadow:
          0 8px 18px rgba(245, 166, 35, 0.2);
        transition:
          transform 150ms ease,
          box-shadow 150ms ease;
      }

      .button:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow:
          0 11px 22px rgba(245, 166, 35, 0.28);
      }

      .button:disabled {
        border-color: #d3d3d3;
        background: #e6e6e6;
        color: #7b7b7b;
        box-shadow: none;
        cursor: not-allowed;
      }

      .code-grid {
        display: grid;
        grid-template-columns:
          repeat(2, minmax(0, 1fr));
        gap: 15px;
      }

      .code-card {
        position: relative;
        overflow: hidden;
        padding: 20px;
        border: 1px solid var(--paw-border);
        border-radius: 16px;
        background: linear-gradient(135deg, var(--paw-white), #ffffff);
      }

      .code-card::before {
        content: "";
        position: absolute;
        width: 7px;
        top: 0;
        bottom: 0;
        left: 0;
        background: var(--paw-teal);
      }

      .code-card code {
        display: block;
        margin-bottom: 10px;
        color: var(--paw-navy);
        font-size: 18px;
        font-weight: 900;
        letter-spacing: 0.055em;
        overflow-wrap: anywhere;
      }

      .code-card span {
        display: block;
        margin-top: 4px;
        color: var(--paw-muted);
        font-size: 13px;
        line-height: 1.5;
      }

      .table-wrap {
        overflow-x: auto;
        border: 1px solid var(--paw-border);
        border-radius: 14px;
      }

      .paw-perks-theme-page table {
        width: 100%;
        border-collapse: collapse;
        background: #ffffff;
      }

      .paw-perks-theme-page th,
      .paw-perks-theme-page td {
        padding: 14px 13px;
        border-bottom: 1px solid #ede7dc;
        text-align: left;
        vertical-align: middle;
        white-space: nowrap;
      }

      .paw-perks-theme-page th {
        background: #faf7f1;
        color: var(--paw-muted);
        font-size: 12px;
        font-weight: 850;
        letter-spacing: 0.03em;
        text-transform: uppercase;
      }

      .paw-perks-theme-page tbody tr:last-child td {
        border-bottom: 0;
      }

      .paw-perks-theme-page tbody tr:hover {
        background: #fffdf8;
      }

      .positive {
        color: var(--paw-success);
        font-weight: 850;
      }

      .negative {
        color: var(--paw-warning);
        font-weight: 850;
      }

      .badge {
        display: inline-flex;
        padding: 5px 10px;
        border-radius: 999px;
        background: #f1f1f1;
        font-size: 12px;
        font-weight: 800;
      }

      .badge--active {
        background: var(--paw-aqua-soft);
        color: var(--paw-success);
      }

      .badge--cancelled {
        background: var(--paw-warning-bg);
        color: var(--paw-warning);
      }

      .empty {
        grid-column: 1 / -1;
        padding: 34px 18px;
        border: 1px dashed #cfc5b5;
        border-radius: 15px;
        background: #fdfaf5;
        text-align: center;
        color: var(--paw-muted);
      }

      .login-card {
        max-width: 760px;
        margin: 58px auto;
        overflow: hidden;
        border: 1px solid var(--paw-border);
        border-radius: 26px;
        background: #ffffff;
        box-shadow: var(--paw-shadow);
        text-align: center;
      }

      .login-card__top {
        padding: 38px;
        background:
          linear-gradient(
            135deg,
            var(--paw-navy),
            var(--paw-navy-soft)
          );
        color: #ffffff;
      }

      .login-card__body {
        padding: 34px;
      }

      .login-card h1 {
        margin: 0;
        font-size: 36px;
        font-weight: 900;
        letter-spacing: -0.04em;
      }

      .login-card p {
        margin: 12px auto 0;
        max-width: 540px;
        color: var(--paw-muted);
        line-height: 1.65;
      }

      .login-card__top p {
        color:
          rgba(255, 255, 255, 0.76);
      }

      .login-link {
        display: inline-flex;
        min-height: 48px;
        align-items: center;
        justify-content: center;
        margin-top: 22px;
        padding: 11px 22px;
        border-radius: 11px;
        background:
          linear-gradient(
            135deg,
            var(--paw-teal),
            #ffbd47
          );
        color: var(--paw-navy);
        font-weight: 900;
        text-decoration: none;
        box-shadow:
          0 10px 22px rgba(245, 166, 35, 0.22);
      }

      .site-footer {
        padding: 28px 18px 34px;
        color: rgba(255, 255, 255, 0.67);
        background: var(--paw-navy);
        text-align: center;
        font-size: 13px;
      }

      .site-footer strong {
        color: #ffffff;
      }

      @media (max-width: 900px) {
        .stats,
        .reward-grid {
          grid-template-columns: 1fr;
        }

        .code-grid {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 640px) {
        .site-header__inner {
          min-height: 68px;
        }

        .brand__logo {
          width: 185px;
          max-width: 185px;
          height: 58px;
        }

        .header-link {
          padding: 8px 11px;
          font-size: 12px;
        }

        .page-shell {
          width: min(100% - 24px, 1180px);
          padding-top: 20px;
        }

        .portal-hero,
        .section {
          padding: 20px;
          border-radius: 18px;
        }

        .portal-hero::after {
          right: 8px;
          font-size: 105px;
        }

        .section-head {
          align-items: flex-start;
          flex-direction: column;
        }

        .section-title-wrap {
          align-items: flex-start;
        }

        .login-card {
          margin: 28px auto;
        }

        .login-card__top,
        .login-card__body {
          padding: 26px 20px;
        }

        th,
        td {
          padding: 12px 10px;
        }
      }

      /* Premium Paw Perks customer dashboard */
      .premium-dashboard {
        display: grid;
        gap: 22px;
      }

      .premium-hero {
        position: relative;
        min-height: 0;
        overflow: hidden;
        border: 1px solid rgba(6,35,63,.12);
        border-radius: 26px;
        background: #061b30;
        box-shadow: 0 24px 70px rgba(5,33,59,.18);
      }

      .premium-hero__image {
        display: block;
        width: 100%;
        height: auto;
        aspect-ratio: 16 / 9;
        object-fit: cover;
        object-position: center;
      }

      .premium-hero::after {
        content: "";
        position: absolute;
        inset: 0;
        background:
          linear-gradient(
            90deg,
            rgba(3,22,42,.56) 0%,
            rgba(3,22,42,.12) 42%,
            rgba(3,22,42,0) 70%
          );
        pointer-events: none;
      }

      .premium-hero__welcome {
        position: absolute;
        z-index: 2;
        left: 34px;
        top: 34px;
        width: min(360px, calc(100% - 68px));
        padding: 20px 22px;
        border: 1px solid rgba(94, 231, 220, 0.34);
        border-radius: 20px;
        background:
          linear-gradient(
            145deg,
            rgba(4, 30, 55, 0.93),
            rgba(7, 47, 72, 0.82)
          );
        color: #fff;
        box-shadow:
          0 18px 50px rgba(0, 0, 0, 0.28),
          inset 0 1px 0 rgba(255,255,255,.08);
        backdrop-filter: blur(16px);
      }

      .premium-hero__welcome::before {
        content: "";
        display: block;
        width: 44px;
        height: 4px;
        margin-bottom: 14px;
        border-radius: 999px;
        background:
          linear-gradient(
            90deg,
            var(--paw-teal),
            #62e6dc
          );
      }

      .premium-hero__welcome span {
        display: block;
        color: #45d8cd;
        font-size: 15px;
        font-weight: 900;
        letter-spacing: .01em;
      }

      .premium-hero__welcome h1 {
        margin: 5px 0 7px;
        color: #fff;
        font-size: clamp(34px, 4.1vw, 52px);
        line-height: .98;
        letter-spacing: -.045em;
        overflow-wrap: anywhere;
      }

      .premium-hero__welcome p {
        margin: 0;
        color: rgba(255,255,255,.78);
        font-size: 15px;
        line-height: 1.45;
      }

      .premium-points {
        position: relative;
        z-index: 3;
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 24px;
        align-items: center;
        margin: -58px 28px 0;
        padding: 22px 26px;
        border: 1px solid var(--paw-border);
        border-radius: 22px;
        background: rgba(255,255,255,.97);
        box-shadow: 0 18px 50px rgba(6,35,63,.14);
      }

      .premium-points__main {
        display: flex;
        gap: 18px;
        align-items: center;
      }

      .premium-points__icon {
        display: grid;
        width: 76px;
        height: 76px;
        place-items: center;
        border-radius: 50%;
        background: linear-gradient(145deg,#e4fbf9,#d5f4f2);
        font-size: 38px;
      }

      .premium-points__balance {
        color: var(--paw-teal-dark);
        font-size: 34px;
        font-weight: 950;
        line-height: 1;
      }

      .premium-points__action {
        text-align: right;
      }

      .premium-points__action button {
        border: 0;
        border-radius: 999px;
        padding: 13px 22px;
        background: #dff8f6;
        color: var(--paw-teal-dark);
        font-weight: 900;
        cursor: pointer;
      }

      .dashboard-tabs {
        display: grid;
        grid-template-columns: repeat(5,minmax(0,1fr));
        overflow: hidden;
        border: 1px solid var(--paw-border);
        border-radius: 20px;
        background: #fff;
        box-shadow: var(--paw-shadow);
      }

      .dashboard-tab {
        min-height: 82px;
        border: 0;
        border-right: 1px solid var(--paw-border);
        border-bottom: 4px solid transparent;
        background: #fff;
        color: var(--paw-muted);
        font-weight: 850;
        cursor: pointer;
      }

      .dashboard-tab:last-child {
        border-right: 0;
      }

      .dashboard-tab.active {
        border-bottom-color: var(--paw-teal);
        color: var(--paw-teal-dark);
        background: linear-gradient(180deg,#fff,#f5fffe);
      }

      .dashboard-panel {
        display: none;
      }

      .dashboard-panel.active {
        display: block;
      }

      .dashboard-grid {
        display: grid;
        grid-template-columns: 1.35fr .65fr;
        gap: 20px;
      }

      .dashboard-card {
        overflow: hidden;
        border: 1px solid var(--paw-border);
        border-radius: 20px;
        background: #fff;
        box-shadow: var(--paw-shadow);
      }

      .dashboard-card__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 21px 22px 15px;
      }

      .dashboard-card__head h2 {
        margin: 0;
        font-size: 21px;
      }

      .dashboard-card__body {
        padding: 0 22px 22px;
      }

      .order-row {
        display: grid;
        grid-template-columns: 64px 1fr auto;
        gap: 15px;
        align-items: center;
        padding: 16px 0;
        border-top: 1px solid var(--paw-border);
      }

      .order-thumb {
        width: 64px;
        height: 64px;
        object-fit: cover;
        border-radius: 14px;
        background: var(--paw-aqua-soft);
      }

      .order-title {
        color: var(--paw-navy);
        font-weight: 900;
      }

      .order-meta {
        margin-top: 4px;
        color: var(--paw-muted);
        font-size: 13px;
      }

      .status-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 8px 12px;
        border-radius: 999px;
        background: var(--paw-aqua-soft);
        color: var(--paw-teal-dark);
        font-size: 12px;
        font-weight: 900;
      }

      .address-card,
      .quick-action {
        padding: 16px;
        border: 1px solid var(--paw-border);
        border-radius: 15px;
        background: #fff;
      }

      .address-card + .address-card {
        margin-top: 12px;
      }

      .default-chip {
        display: inline-flex;
        margin-left: 7px;
        padding: 3px 8px;
        border-radius: 999px;
        background: var(--paw-aqua);
        color: var(--paw-teal-dark);
        font-size: 11px;
        font-weight: 900;
      }

      .quick-actions {
        display: grid;
        gap: 9px;
      }

      .quick-action {
        display: flex;
        justify-content: space-between;
        color: var(--paw-navy);
        text-decoration: none;
        font-weight: 800;
      }

      .subscribe-banner {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 20px;
        align-items: center;
        padding: 26px;
        border: 1px solid #ccecea;
        border-radius: 22px;
        background: linear-gradient(100deg,#eefcfb,#fff,#eefcfb);
      }

      .subscribe-banner h3 {
        margin: 0 0 7px;
        font-size: 24px;
      }

      .subscribe-banner p {
        margin: 0;
        color: var(--paw-muted);
      }

      .subscribe-banner a {
        padding: 13px 20px;
        border-radius: 999px;
        background: linear-gradient(135deg,var(--paw-teal),#28c8be);
        color: #fff;
        font-weight: 900;
        text-decoration: none;
      }

      .panel-section {
        padding: 26px;
        border: 1px solid var(--paw-border);
        border-radius: 20px;
        background: #fff;
        box-shadow: var(--paw-shadow);
      }

      .panel-section h2 {
        margin: 0 0 18px;
      }

      @media (max-width: 850px) {
        .premium-hero {
          min-height: 390px;
          background-position: 60% center;
        }

        .premium-hero__welcome {
          left: 16px;
          right: 16px;
          bottom: 16px;
          max-width: none;
        }

        .premium-points {
          grid-template-columns: 1fr;
          margin: -20px 12px 0;
        }

        .premium-points__action {
          text-align: left;
        }

        .dashboard-tabs {
          grid-template-columns: repeat(5, minmax(94px,1fr));
          overflow-x: auto;
        }

        .dashboard-grid {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 560px) {
        .premium-hero {
          min-height: 310px;
          border-radius: 20px;
          background-position: 68% center;
        }

        .premium-hero__welcome {
          padding: 16px;
        }

        .premium-hero__welcome h1 {
          font-size: 30px;
        }

        .premium-points {
          padding: 18px;
        }

        .premium-points__icon {
          width: 60px;
          height: 60px;
          font-size: 30px;
        }

        .order-row {
          grid-template-columns: 54px 1fr;
        }

        .order-row .status-pill {
          grid-column: 2;
          justify-self: start;
        }

        .subscribe-banner {
          grid-template-columns: 1fr;
        }
      }


      .dashboard-card__body .empty {
        min-height: 0;
        padding: 28px 18px;
      }

      .dashboard-card {
        align-self: start;
      }

      .dashboard-grid {
        align-items: start;
      }

      .dashboard-card__body {
        min-height: 0;
      }

      .dashboard-card__body:has(.empty) {
        padding-bottom: 22px;
      }

      .quick-action.dashboard-tab {
        min-height: auto;
        width: 100%;
        border-bottom: 1px solid var(--paw-border);
        border-radius: 15px;
        background: #fff;
        color: var(--paw-navy);
        text-align: left;
      }

      @media (max-width: 850px) {
        .premium-hero__image {
          aspect-ratio: 4 / 3;
          object-position: 62% center;
        }

        .premium-hero__welcome {
          top: auto;
          bottom: 16px;
          left: 16px;
          width: calc(100% - 32px);
        }
      }

      @media (max-width: 560px) {
        .premium-hero__image {
          aspect-ratio: 1 / 1;
          object-position: 68% center;
        }

        .premium-hero::after {
          background:
            linear-gradient(
              0deg,
              rgba(3,22,42,.78) 0%,
              rgba(3,22,42,.15) 58%,
              rgba(3,22,42,0) 100%
            );
        }
      }


      .account-form {
        display: grid;
        gap: 16px;
      }

      .form-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .form-field {
        display: grid;
        gap: 7px;
      }

      .form-field--full {
        grid-column: 1 / -1;
      }

      .form-field label {
        color: var(--paw-navy);
        font-size: 13px;
        font-weight: 850;
      }

      .form-field input,
      .form-field select {
        width: 100%;
        min-height: 46px;
        padding: 11px 13px;
        border: 1px solid var(--paw-border);
        border-radius: 11px;
        background: #fff;
        color: var(--paw-navy);
      }

      .form-field input:focus,
      .form-field select:focus {
        outline: 3px solid rgba(16,184,174,.14);
        border-color: var(--paw-teal);
      }

      .form-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .secondary-button,
      .danger-button {
        min-height: 42px;
        padding: 10px 15px;
        border-radius: 10px;
        font-weight: 850;
        cursor: pointer;
      }

      .secondary-button {
        border: 1px solid var(--paw-teal);
        background: #fff;
        color: var(--paw-teal-dark);
      }

      .danger-button {
        border: 1px solid #dfaaa3;
        background: #fff7f5;
        color: #9e3d31;
      }

      .address-editor {
        margin-top: 14px;
        padding: 18px;
        border: 1px solid var(--paw-border);
        border-radius: 15px;
        background: #fbfefe;
      }

      .security-card {
        padding: 18px;
        border: 1px solid #cfe8ea;
        border-radius: 15px;
        background: linear-gradient(145deg,#f3fffe,#fff);
      }

      .security-card h3 {
        margin: 0 0 7px;
      }

      .security-card p {
        margin: 0 0 14px;
        color: var(--paw-muted);
        line-height: 1.55;
      }

      @media (max-width: 640px) {
        .form-grid {
          grid-template-columns: 1fr;
        }

        .form-field--full {
          grid-column: auto;
        }
      }

    </style>
  <div class="page-shell paw-perks-theme-page">
    ${content}
  </div>


    <script>
      (function(){
        function handleCopy(btn){
          try{
            const code = btn.getAttribute('data-code');
            if(!code) return;
            navigator.clipboard.writeText(code).then(()=>{
              const original = btn.textContent;
              btn.textContent = 'Copied!';
              setTimeout(()=> btn.textContent = original, 1200);
            }).catch(()=>{
              // fallback
              const ta = document.createElement('textarea');
              ta.value = code; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
            });
          }catch(e){console.error(e)}
        }

        document.addEventListener('click', function(e){
          const btn = e.target.closest && e.target.closest('.copy-btn');
          if(btn) { e.preventDefault(); handleCopy(btn); }
        });
      })();
    </script>

    <script>
      (function () {
        function activateDashboardTab(tabName) {
          document.querySelectorAll(".dashboard-tab").forEach(function (button) {
            button.classList.toggle(
              "active",
              button.getAttribute("data-tab") === tabName,
            );
          });

          document.querySelectorAll(".dashboard-panel").forEach(function (panel) {
            panel.classList.toggle(
              "active",
              panel.getAttribute("data-panel") === tabName,
            );
          });

          if (history.replaceState) {
            history.replaceState(null, "", "#" + tabName);
          }
        }

        document.addEventListener("click", function (event) {
          var button =
            event.target.closest &&
            event.target.closest(".dashboard-tab");

          if (!button) {
            return;
          }

          event.preventDefault();
          activateDashboardTab(
            button.getAttribute("data-tab") || "dashboard",
          );
        });

        var dashboardRoot =
          document.querySelector(".premium-dashboard");

        var initialTab =
          location.hash.replace("#", "") ||
          (dashboardRoot &&
            dashboardRoot.getAttribute(
              "data-initial-tab",
            )) ||
          "dashboard";

        if (
          !document.querySelector(
            '.dashboard-panel[data-panel="' +
              initialTab +
              '"]',
          )
        ) {
          initialTab = "dashboard";
        }

        activateDashboardTab(initialTab);
      })();
    </script>

`;
}

function renderSignedOutPage({
  shop,
  errorMessage,
}: {
  shop: string;
  errorMessage: string;
}): string {
  return pageShell(`
    <section class="login-card">
      <div class="login-card__top">
        <span class="eyebrow">
          PawMart loyalty rewards
        </span>

        <h1>Welcome to Paw Perks</h1>

        <p>
          Earn rewards every time you shop for the pets
          you love.
        </p>
      </div>

      <div class="login-card__body">
        <h2>Sign in to view your rewards</h2>

        <p>
          Check your Paw Points balance, redeem available
          rewards, and access your active discount codes.
        </p>

        ${
          errorMessage
            ? `<div class="notice notice--error">
                ${escapeHtml(errorMessage)}
              </div>`
            : ""
        }

        <a
          class="login-link"
          href="https://${escapeHtml(shop)}/account/login"
        >
          Sign in to PawMart
        </a>
      </div>
    </section>
  `, shop);
}

function renderMissingMemberPage({
  shop,
  loggedInCustomerId,
}: {
  shop: string;
  loggedInCustomerId: string;
}): string {
  return pageShell(`
    <section class="login-card">
      <span class="eyebrow">
        Paw Perks
      </span>

      <h1>Your membership is being prepared</h1>

      <p>
        Your Shopify account is signed in, but Paw Perks
        does not yet have a loyalty profile for this customer.
      </p>

      <p>
        Customer ID:
        ${escapeHtml(loggedInCustomerId)}
      </p>

      <a
        class="login-link"
        href="https://${escapeHtml(shop)}"
      >
        Return to PawMart
      </a>
    </section>
  `, shop);
}

function renderPortal({
  shop,
  customer,
  rewards,
  activeRedemptions,
  successMessage,
  errorMessage,
  redeemedCode,
  requestedTab,
  dashboardData,
}: {
  shop: string;
  customer: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    pointsBalance: number;
    lifetimePoints: number;
    tier: string;
    transactions: Array<{
      id: string;
      type: string;
      points: number;
      balanceAfter: number;
      description: string | null;
      createdAt: Date;
    }>;
    redemptions: Array<{
      id: string;
      pointsSpent: number;
      discountCode: string;
      status: string;
      redeemedAt: Date;
      expiresAt: Date | null;
      reward: {
        name: string;
      };
    }>;
  };
  rewards: Array<{
    id: string;
    name: string;
    description: string | null;
    pointsRequired: number;
    discountType: string;
    discountValue: number;
    minimumSpend: number | null;
    expiresInDays: number | null;
  }>;
  activeRedemptions: Array<{
    id: string;
    discountCode: string;
    expiresAt: Date | null;
    reward: {
      name: string;
    };
  }>;
  successMessage: string;
  errorMessage: string;
  redeemedCode: string;
  requestedTab: string;
  dashboardData: {
    orders: Array<{
      id: string;
      name: string;
      createdAt: string;
      fulfillmentStatus: string;
      financialStatus: string;
      total: string;
      currencyCode: string;
      productTitle: string;
      productImage: string | null;
    }>;
    addresses: Array<{
      id: string;
      name: string;
      firstName: string;
      lastName: string;
      company: string;
      address1: string;
      address2: string;
      city: string;
      province: string;
      zip: string;
      country: string;
      phone: string;
      isDefault: boolean;
    }>;
  };
}): string {
  const displayName =
    customer.firstName?.trim() ||
    "Paw Perks Member";

  const orderRows = dashboardData.orders.length
    ? dashboardData.orders
        .map((order) => {
          const createdDate =
            new Intl.DateTimeFormat("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }).format(new Date(order.createdAt));

          const status =
            order.fulfillmentStatus === "FULFILLED"
              ? "Delivered"
              : order.fulfillmentStatus === "IN_PROGRESS"
                ? "Processing"
                : order.fulfillmentStatus === "PARTIALLY_FULFILLED"
                  ? "Partially shipped"
                  : order.fulfillmentStatus === "ON_HOLD"
                    ? "On hold"
                    : "Processing";

          return `
            <div class="order-row">
              ${
                order.productImage
                  ? `<img
                      class="order-thumb"
                      src="${escapeHtml(order.productImage)}"
                      alt=""
                    />`
                  : `<div class="order-thumb"></div>`
              }

              <div>
                <div class="order-title">
                  ${escapeHtml(order.name)}
                  · ${escapeHtml(order.productTitle)}
                </div>

                <div class="order-meta">
                  ${escapeHtml(createdDate)}
                  · ${escapeHtml(order.currencyCode)}
                  ${escapeHtml(order.total)}
                </div>
              </div>

              <span class="status-pill">
                ${escapeHtml(status)}
              </span>
            </div>
          `;
        })
        .join("")
    : `<div class="empty">
        No orders are available for this customer yet.
      </div>`;

  const addressCards = dashboardData.addresses.length
    ? dashboardData.addresses
        .map(
          (address) => `
            <div class="address-card">
              <strong>
                ${escapeHtml(address.name)}
                ${
                  address.isDefault
                    ? `<span class="default-chip">
                        Default
                      </span>`
                    : ""
                }
              </strong>

              <div class="order-meta">
                ${escapeHtml(address.address1)}
                ${
                  address.address2
                    ? `<br />${escapeHtml(address.address2)}`
                    : ""
                }
                <br />
                ${escapeHtml(address.city)},
                ${escapeHtml(address.province)}
                ${escapeHtml(address.zip)}
                <br />
                ${escapeHtml(address.country)}
              </div>

              <details class="address-editor">
                <summary>Edit address</summary>

                <form method="post" class="account-form" style="margin-top:14px">
                  <input type="hidden" name="intent" value="update-address" />
                  <input type="hidden" name="addressId" value="${escapeHtml(address.id)}" />

                  <div class="form-grid">
                    <div class="form-field">
                      <label>First name</label>
                      <input name="firstName" value="${escapeHtml(address.firstName)}" required />
                    </div>

                    <div class="form-field">
                      <label>Last name</label>
                      <input name="lastName" value="${escapeHtml(address.lastName)}" required />
                    </div>

                    <div class="form-field form-field--full">
                      <label>Company</label>
                      <input name="company" value="${escapeHtml(address.company)}" />
                    </div>

                    <div class="form-field form-field--full">
                      <label>Address</label>
                      <input name="address1" value="${escapeHtml(address.address1)}" required />
                    </div>

                    <div class="form-field form-field--full">
                      <label>Apartment, suite, etc.</label>
                      <input name="address2" value="${escapeHtml(address.address2)}" />
                    </div>

                    <div class="form-field">
                      <label>City</label>
                      <input name="city" value="${escapeHtml(address.city)}" required />
                    </div>

                    <div class="form-field">
                      <label>State / province code</label>
                      <input name="provinceCode" value="${escapeHtml(address.province)}" />
                    </div>

                    <div class="form-field">
                      <label>ZIP / postal code</label>
                      <input name="zip" value="${escapeHtml(address.zip)}" required />
                    </div>

                    <div class="form-field">
                      <label>Country code</label>
                      <input name="countryCode" value="US" maxlength="2" required />
                    </div>

                    <div class="form-field form-field--full">
                      <label>Phone</label>
                      <input name="phone" value="${escapeHtml(address.phone)}" />
                    </div>
                  </div>

                  <label>
                    <input type="checkbox" name="setAsDefault" ${address.isDefault ? "checked" : ""} />
                    Make this my default address
                  </label>

                  <div class="form-actions">
                    <button class="button" type="submit">Save address</button>
                  </div>
                </form>

                <div class="form-actions" style="margin-top:10px">
                  ${
                    address.isDefault
                      ? ""
                      : `<form method="post">
                          <input type="hidden" name="intent" value="set-default-address" />
                          <input type="hidden" name="addressId" value="${escapeHtml(address.id)}" />
                          <button class="secondary-button" type="submit">
                            Set as default
                          </button>
                        </form>`
                  }

                  <form method="post" onsubmit="return confirm('Delete this address?');">
                    <input type="hidden" name="intent" value="delete-address" />
                    <input type="hidden" name="addressId" value="${escapeHtml(address.id)}" />
                    <button class="danger-button" type="submit">
                      Delete address
                    </button>
                  </form>
                </div>
              </details>
            </div>
          `,
        )
        .join("")
    : `<div class="empty">
        No saved addresses were found.
      </div>`;

  const rewardsHtml = rewards.length
    ? rewards
        .map((reward) => {
          const canRedeem =
            customer.pointsBalance >=
            reward.pointsRequired;

          return `
            <article class="reward">
              <span class="reward__value">
                ${escapeHtml(
                  formatDiscount(
                    reward.discountType,
                    reward.discountValue,
                  ),
                )}
              </span>

              <h3>${escapeHtml(reward.name)}</h3>

              <p>
                ${escapeHtml(
                  reward.description ??
                    "Redeem this Paw Perks reward on a future order.",
                )}
              </p>

              <div class="reward__meta">
                <span class="reward__points">
                  ${reward.pointsRequired} Paw Points
                </span>

                <form method="post">
                  <input
                    type="hidden"
                    name="rewardDefinitionId"
                    value="${escapeHtml(reward.id)}"
                  />

                  <button
                    class="button"
                    type="submit"
                    ${canRedeem ? "" : "disabled"}
                  >
                    ${
                      canRedeem
                        ? "Redeem reward"
                        : `Need ${
                            reward.pointsRequired -
                            customer.pointsBalance
                          } more points`
                    }
                  </button>
                </form>
              </div>
            </article>
          `;
        })
        .join("")
    : `<div class="empty">
        No rewards are currently available.
      </div>`;

  const codesHtml = activeRedemptions.length
    ? activeRedemptions
        .map(
          (redemption) => `
            <article class="code-card">
              <code>
                ${escapeHtml(redemption.discountCode)}
              </code>

              <span>
                ${escapeHtml(redemption.reward.name)}
              </span>

              <span>
                Expires:
                ${escapeHtml(formatDate(redemption.expiresAt))}
              </span>

              <div class="code-card__actions">
                <button
                  class="copy-btn"
                  data-code="${escapeHtml(redemption.discountCode)}"
                  type="button"
                >
                  Copy code
                </button>
              </div>
            </article>
          `,
        )
        .join("")
    : `<div class="empty">
        You do not have any active reward codes.
      </div>`;

  const transactionsHtml =
    customer.transactions.length
      ? customer.transactions
          .map(
            (transaction) => `
              <tr>
                <td>
                  ${escapeHtml(
                    transaction.description ??
                      transaction.type,
                  )}
                </td>
                <td class="${
                  transaction.points >= 0
                    ? "positive"
                    : "negative"
                }">
                  ${
                    transaction.points >= 0 ? "+" : ""
                  }${transaction.points}
                </td>
                <td>${transaction.balanceAfter}</td>
                <td>
                  ${escapeHtml(
                    new Intl.DateTimeFormat(
                      "en-US",
                      {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      },
                    ).format(transaction.createdAt),
                  )}
                </td>
              </tr>
            `,
          )
          .join("")
      : `<tr>
          <td colspan="4">
            No points activity is available.
          </td>
        </tr>`;

  const nextReward =
    rewards.find(
      (reward) =>
        reward.pointsRequired >
        customer.pointsBalance,
    ) ?? null;

  const progressMessage = nextReward
    ? `${nextReward.pointsRequired - customer.pointsBalance} more points until your next reward`
    : rewards.length
      ? "A reward is ready to redeem"
      : "New rewards are coming soon";

  return pageShell(`
    <div
      class="premium-dashboard"
      id="top"
      data-initial-tab="${escapeHtml(
        requestedTab || "dashboard",
      )}"
    >
      <section class="premium-hero">
        <img
          class="premium-hero__image"
          src="https://virphone.b-cdn.net/PawMart/ChatGPT%20Image%20Jul%2016%2C%202026%2C%2003_48_05%20PM.png"
          alt="PawMart PawPerks rewards with a dog, cat, and pet essentials"
        />

        <div class="premium-hero__welcome">
          <span>Welcome back,</span>
          <h1>${escapeHtml(displayName)}!</h1>
          <p>We’re happy to see you again.</p>
        </div>
      </section>

      <section class="premium-points">
        <div class="premium-points__main">
          <div class="premium-points__icon" aria-hidden="true">
            🐾
          </div>

          <div>
            <strong>PawPoints Rewards</strong>
            <div class="premium-points__balance">
              ${customer.pointsBalance.toLocaleString("en-US")}
            </div>
            <div class="order-meta">
              Points available · ${escapeHtml(customer.tier)}
            </div>
          </div>
        </div>

        <div class="premium-points__action">
          <button
            type="button"
            class="dashboard-tab-link"
            onclick="document.querySelector('[data-tab=rewards]').click()"
          >
            View Rewards
          </button>

          <div class="order-meta" style="margin-top:8px">
            ${escapeHtml(progressMessage)}
          </div>
        </div>
      </section>

      <nav class="dashboard-tabs" aria-label="Customer dashboard">
        <button class="dashboard-tab active" data-tab="dashboard" type="button">
          Dashboard
        </button>
        <button class="dashboard-tab" data-tab="orders" type="button">
          Orders
        </button>
        <button class="dashboard-tab" data-tab="addresses" type="button">
          Addresses
        </button>
        <button class="dashboard-tab" data-tab="rewards" type="button">
          Rewards
        </button>
        <button class="dashboard-tab" data-tab="account" type="button">
          Account
        </button>
      </nav>

      ${
        successMessage
          ? `<div class="notice notice--success">
              ${escapeHtml(successMessage)}
              ${
                redeemedCode
                  ? `<code class="new-code">
                      ${escapeHtml(redeemedCode)}
                    </code>`
                  : ""
              }
            </div>`
          : ""
      }

      ${
        errorMessage
          ? `<div class="notice notice--error">
              ${escapeHtml(errorMessage)}
            </div>`
          : ""
      }

      <section class="dashboard-panel active" data-panel="dashboard">
        <div class="dashboard-grid">
          <article class="dashboard-card">
            <div class="dashboard-card__head">
              <h2>Recent Orders</h2>
              <button class="dashboard-tab-link" data-tab-target="orders" type="button"
                onclick="document.querySelector('[data-tab=orders]').click()">
                View all orders
              </button>
            </div>
            <div class="dashboard-card__body">
              ${dashboardData.orders.length
                ? dashboardData.orders.slice(0, 3).map((order) => {
                    const createdDate =
                      new Intl.DateTimeFormat("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }).format(new Date(order.createdAt));

                    return `
                      <div class="order-row">
                        ${
                          order.productImage
                            ? `<img class="order-thumb" src="${escapeHtml(order.productImage)}" alt="" />`
                            : `<div class="order-thumb"></div>`
                        }
                        <div>
                          <div class="order-title">
                            ${escapeHtml(order.name)}
                            · ${escapeHtml(order.productTitle)}
                          </div>
                          <div class="order-meta">
                            ${escapeHtml(createdDate)}
                            · ${escapeHtml(order.currencyCode)}
                            ${escapeHtml(order.total)}
                          </div>
                        </div>
                        <span class="status-pill">
                          ${escapeHtml(
                            order.fulfillmentStatus === "FULFILLED"
                              ? "Delivered"
                              : "Processing",
                          )}
                        </span>
                      </div>
                    `;
                  }).join("")
                : `<div class="empty">
                    No orders are available yet.
                  </div>`
              }
            </div>
          </article>

          <div style="display:grid;gap:20px">
            <article class="dashboard-card">
              <div class="dashboard-card__head">
                <h2>Saved Address</h2>
              </div>
              <div class="dashboard-card__body">
                ${
                  dashboardData.addresses[0]
                    ? addressCards.split("</div>")[0] + "</div>"
                    : `<div class="empty">
                        No saved address found.
                      </div>`
                }
              </div>
            </article>

            <article class="dashboard-card">
              <div class="dashboard-card__head">
                <h2>Quick Actions</h2>
              </div>
              <div class="dashboard-card__body quick-actions">
                <a class="quick-action" href="https://${escapeHtml(shop)}/account">
                  Manage Profile <span>›</span>
                </a>
                <a class="quick-action" href="https://${escapeHtml(shop)}/account/addresses">
                  Manage Addresses <span>›</span>
                </a>
                <button class="quick-action dashboard-tab" data-tab="rewards" type="button">
                  View Rewards <span>›</span>
                </button>
                <a class="quick-action" href="https://${escapeHtml(shop)}/account/logout">
                  Sign Out <span>›</span>
                </a>
              </div>
            </article>
          </div>
        </div>

        <div class="subscribe-banner" style="margin-top:20px">
          <div>
            <h3>Subscribe & Save</h3>
            <p>
              Save up to 15% on your favorite essentials,
              delivered on your schedule.
            </p>
          </div>
          <a href="https://${escapeHtml(shop)}/pages/autoship-save">
            Manage Subscriptions
          </a>
        </div>
      </section>

      <section class="dashboard-panel" data-panel="orders">
        <div class="panel-section">
          <h2>Your Orders</h2>
          ${orderRows}
          <div style="margin-top:18px">
            <a class="login-link" href="https://${escapeHtml(shop)}/account/orders">
              Open complete order history
            </a>
          </div>
        </div>
      </section>

      <section class="dashboard-panel" data-panel="addresses">
        <div class="panel-section">
          <h2>Saved Addresses</h2>
          ${addressCards}
        </div>

        <div class="panel-section" style="margin-top:20px">
          <h2>Add a New Address</h2>

          <form method="post" class="account-form">
            <input type="hidden" name="intent" value="create-address" />

            <div class="form-grid">
              <div class="form-field">
                <label>First name</label>
                <input name="firstName" value="${escapeHtml(customer.firstName ?? "")}" required />
              </div>

              <div class="form-field">
                <label>Last name</label>
                <input name="lastName" value="${escapeHtml(customer.lastName ?? "")}" required />
              </div>

              <div class="form-field form-field--full">
                <label>Company</label>
                <input name="company" />
              </div>

              <div class="form-field form-field--full">
                <label>Address</label>
                <input name="address1" required />
              </div>

              <div class="form-field form-field--full">
                <label>Apartment, suite, etc.</label>
                <input name="address2" />
              </div>

              <div class="form-field">
                <label>City</label>
                <input name="city" required />
              </div>

              <div class="form-field">
                <label>State / province code</label>
                <input name="provinceCode" placeholder="KY" />
              </div>

              <div class="form-field">
                <label>ZIP / postal code</label>
                <input name="zip" required />
              </div>

              <div class="form-field">
                <label>Country code</label>
                <input name="countryCode" value="US" maxlength="2" required />
              </div>

              <div class="form-field form-field--full">
                <label>Phone</label>
                <input name="phone" />
              </div>
            </div>

            <label>
              <input type="checkbox" name="setAsDefault" />
              Make this my default address
            </label>

            <button class="button" type="submit">
              Add address
            </button>
          </form>
        </div>
      </section>

      <section class="dashboard-panel" data-panel="rewards">
        <div class="panel-section">
          <h2>Available Rewards</h2>
          <div class="reward-grid">${rewardsHtml}</div>
        </div>

        <div class="panel-section" style="margin-top:20px">
          <h2>Your Active Codes</h2>
          <div class="code-grid">${codesHtml}</div>
        </div>

        <div class="panel-section" style="margin-top:20px">
          <h2>Points Activity</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>Points</th>
                  <th>Balance</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>${transactionsHtml}</tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="dashboard-panel" data-panel="account">
        <div class="dashboard-grid">
          <div class="panel-section">
            <h2>Profile Information</h2>

            <form method="post" class="account-form">
              <input type="hidden" name="intent" value="update-profile" />

              <div class="form-grid">
                <div class="form-field">
                  <label for="profile-first-name">First name</label>
                  <input
                    id="profile-first-name"
                    name="firstName"
                    value="${escapeHtml(customer.firstName ?? "")}"
                    autocomplete="given-name"
                    required
                  />
                </div>

                <div class="form-field">
                  <label for="profile-last-name">Last name</label>
                  <input
                    id="profile-last-name"
                    name="lastName"
                    value="${escapeHtml(customer.lastName ?? "")}"
                    autocomplete="family-name"
                  />
                </div>

                <div class="form-field form-field--full">
                  <label for="profile-email">Email address</label>
                  <input
                    id="profile-email"
                    name="email"
                    type="email"
                    value="${escapeHtml(customer.email ?? "")}"
                    autocomplete="email"
                    required
                  />
                </div>
              </div>

              <button class="button" type="submit">
                Save profile
              </button>
            </form>
          </div>

          <div style="display:grid;gap:20px">
            <div class="panel-section">
              <h2>Paw Perks Membership</h2>
              <p><strong>Member tier:</strong> ${escapeHtml(customer.tier)}</p>
              <p><strong>Available points:</strong> ${customer.pointsBalance}</p>
              <p><strong>Lifetime points:</strong> ${customer.lifetimePoints}</p>
            </div>

            <div class="security-card">
              <h3>Sign-in & Security</h3>
              <p>
                Paw Perks uses your main PawMart Shopify customer account.
                There is no separate Paw Perks login. Password or one-time-code
                settings remain securely managed by Shopify.
              </p>

              <div class="form-actions">
                <a class="secondary-button" href="https://${escapeHtml(shop)}/account">
                  Manage sign-in
                </a>

                <a class="secondary-button" href="https://${escapeHtml(shop)}/account/logout">
                  Sign out
                </a>
              </div>
            </div>

            <div class="panel-section">
              <h2>Addresses</h2>
              <p class="section-copy">
                Add, edit, delete, or choose your default shipping address.
              </p>
              <button
                class="secondary-button dashboard-tab"
                data-tab="addresses"
                type="button"
              >
                Manage addresses
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  `, shop);
}

