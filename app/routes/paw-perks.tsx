import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import prisma from "../db.server";
import { redeemReward } from "../redemption.server";
import { authenticate } from "../shopify.server";

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

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type":
          "text/html; charset=utf-8",
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

      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type":
            "text/html; charset=utf-8",
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

      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type":
            "text/html; charset=utf-8",
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
  });

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type":
        "text/html; charset=utf-8",
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

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />

    <meta
      name="viewport"
      content="width=device-width, initial-scale=1"
    />

    <meta
      name="theme-color"
      content="#ffffff"
    />

    <title>Paw Perks | PawMart</title>

    <style>
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

      * {
        box-sizing: border-box;
      }

      html {
        scroll-behavior: smooth;
      }

      body {
        margin: 0;
        min-height: 100vh;
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

      button,
      input,
      select {
        font: inherit;
      }

      a {
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

      table {
        width: 100%;
        border-collapse: collapse;
        background: #ffffff;
      }

      th,
      td {
        padding: 14px 13px;
        border-bottom: 1px solid #ede7dc;
        text-align: left;
        vertical-align: middle;
        white-space: nowrap;
      }

      th {
        background: #faf7f1;
        color: var(--paw-muted);
        font-size: 12px;
        font-weight: 850;
        letter-spacing: 0.03em;
        text-transform: uppercase;
      }

      tbody tr:last-child td {
        border-bottom: 0;
      }

      tbody tr:hover {
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
    </style>
  </head>

  <body>
    <div class="top-announcement" role="region" aria-label="Announcement">
      <span aria-hidden="true">🚚</span>
      &nbsp;Free shipping over $49 · Premium pet essentials delivered with love
    </div>

    <header class="site-header">
      <div class="site-header__inner">
        <a class="brand" href="${storeUrl}" aria-label="PawMart home">
          ${
            PAWMART_LOGO_URL.includes("PASTE_")
              ? `
                <span class="brand__fallback">
                  <span class="brand__paw" aria-hidden="true">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <path d="M7.5 6.5C8.88071 6.5 10 5.38071 10 4C10 2.61929 8.88071 1.5 7.5 1.5C6.11929 1.5 5 2.61929 5 4C5 5.38071 6.11929 6.5 7.5 6.5Z" fill="var(--paw-teal)"/>
                      <path d="M16.5 6.5C17.8807 6.5 19 5.38071 19 4C19 2.61929 17.8807 1.5 16.5 1.5C15.1193 1.5 14 2.61929 14 4C14 5.38071 15.1193 6.5 16.5 6.5Z" fill="var(--paw-teal)"/>
                      <path d="M7 11C8.65685 11 10 9.65685 10 8C10 6.34315 8.65685 5 7 5C5.34315 5 4 6.34315 4 8C4 9.65685 5.34315 11 7 11Z" fill="var(--paw-teal)"/>
                      <path d="M17 11C18.6569 11 20 9.65685 20 8C20 6.34315 18.6569 5 17 5C15.3431 5 14 6.34315 14 8C14 9.65685 15.3431 11 17 11Z" fill="var(--paw-teal)"/>
                      <path d="M12 13C14.7614 13 17 15.2386 17 18C17 20.7614 14.7614 23 12 23C9.23858 23 7 20.7614 7 18C7 15.2386 9.23858 13 12 13Z" fill="var(--paw-teal)"/>
                    </svg>
                  </span>
                  PawMart
                </span>
              `
              : `
                <img
                  class="brand__logo"
                  src="${escapeHtml(PAWMART_LOGO_URL)}"
                  alt="PawMart"
                />
              `
          }
        </a>

        <nav class="header-actions" aria-label="Header actions">
          <a class="header-link" href="${storeUrl}" aria-label="Shop">Shop</a>

          <button class="header-icon" aria-label="Search" type="button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 21l-4.35-4.35" stroke="var(--paw-navy)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="11" cy="11" r="6" stroke="var(--paw-navy)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>

          <a class="header-icon header-account" href="#" aria-label="Account">
            <span class="account-circle" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5z" stroke="var(--paw-navy)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 20c0-3.314 2.686-6 6-6h4c3.314 0 6 2.686 6 6" stroke="var(--paw-navy)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
          </a>

          <a class="header-icon" href="#" aria-label="Cart">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6h15l-1.5 9h-12z" stroke="var(--paw-navy)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="20" r="1" fill="var(--paw-teal)"/><circle cx="18" cy="20" r="1" fill="var(--paw-teal)"/></svg>
          </a>

          <button class="header-icon" aria-label="Menu" type="button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" stroke="var(--paw-navy)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </nav>
      </div>
    </header>

    <main class="page-shell">
      ${content}
    </main>

    <footer class="site-footer">
      <strong>Paw Perks by PawMart</strong>
      <br />
      Rewards for pets, savings for their people.
    </footer>
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
  </body>
</html>`;
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
}): string {
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

              <h3>
                ${escapeHtml(reward.name)}
              </h3>

              <p>
                ${escapeHtml(
                  reward.description ??
                    "Redeem this Paw Perks reward on a future order.",
                )}
              </p>

              <div class="reward__details">
                ${
                  reward.minimumSpend
                    ? `<span>
                        Minimum purchase:
                        $${(
                          reward.minimumSpend / 100
                        ).toFixed(2)}
                      </span>`
                    : `<span>
                        No minimum purchase required
                      </span>`
                }

                ${
                  reward.expiresInDays
                    ? `<span>
                        Code expires after
                        ${reward.expiresInDays} days
                      </span>`
                    : `<span>
                        Reward does not expire
                      </span>`
                }
              </div>

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
              <div class="code-card__inner">
                <code>
                  ${escapeHtml(redemption.discountCode)}
                </code>

                <div class="code-card__meta">
                  <div class="code-card__name">${escapeHtml(
                    redemption.reward.name,
                  )}</div>

                  <div class="code-card__expires">Expires: ${escapeHtml(
                    formatDate(redemption.expiresAt),
                  )}</div>
                </div>

                <div class="code-card__actions">
                  <button class="copy-btn" data-code="${escapeHtml(
                    redemption.discountCode,
                  )}" aria-label="Copy code">Copy</button>
                </div>
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
                    transaction.points >= 0
                      ? "+"
                      : ""
                  }${transaction.points}
                </td>

                <td>
                  ${transaction.balanceAfter}
                </td>

                <td>
                  ${escapeHtml(
                    new Intl.DateTimeFormat(
                      "en-US",
                      {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      },
                    ).format(
                      transaction.createdAt,
                    ),
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

  const redemptionsHtml =
    customer.redemptions.length
      ? customer.redemptions
          .map(
            (redemption) => `
              <tr>
                <td>
                  ${escapeHtml(
                    redemption.reward.name,
                  )}
                </td>

                <td>
                  ${redemption.pointsSpent}
                </td>

                <td>
                  <code>
                    ${escapeHtml(
                      redemption.discountCode,
                    )}
                  </code>
                </td>

                <td>
                  <span class="badge ${
                    redemption.status === "ACTIVE"
                      ? "badge--active"
                      : redemption.status ===
                          "CANCELLED"
                        ? "badge--cancelled"
                        : ""
                  }">
                    ${escapeHtml(
                      redemption.status,
                    )}
                  </span>
                </td>

                <td>
                  ${escapeHtml(
                    formatDate(
                      redemption.redeemedAt,
                    ),
                  )}
                </td>
              </tr>
            `,
          )
          .join("")
      : `<tr>
          <td colspan="5">
            No rewards have been redeemed.
          </td>
        </tr>`;

  const nextReward =
    rewards.find(
      (r) => r.pointsRequired > customer.pointsBalance,
    ) ?? null;

  let progressMessage = "";

  if (rewards.length === 0) {
    progressMessage = "New rewards are coming soon.";
  } else if (!nextReward) {
    progressMessage = "You have a reward ready to redeem.";
  } else {
    progressMessage = `You need $${
      nextReward.pointsRequired - customer.pointsBalance
    } more points for a ${formatDiscount(
      nextReward.discountType,
      nextReward.discountValue,
    )} reward.`;
  }

  return pageShell(`
    <section class="account-hero">
      <div class="hero-copy">
        <div class="eyebrow">Paw Perks member</div>

        <h1>
          Welcome, ${escapeHtml(customer.firstName || customerName(customer))}
        </h1>

        <p>
          We’re happy to see you again.
        </p>
      </div>

      ${PAWMART_ACCOUNT_HERO_URL
        ? `<img src="${escapeHtml(
            PAWMART_ACCOUNT_HERO_URL,
          )}" alt="PawMart pets" class="hero-pets" />`
        : `<div class="hero-decor" aria-hidden="true">
            <svg width="160" height="160" viewBox="0 0 160 160" fill="none" aria-hidden="true">
              <g opacity="0.12" fill="none" stroke="var(--paw-teal)">
                <circle cx="30" cy="30" r="12" stroke-width="2" />
                <circle cx="50" cy="20" r="8" stroke-width="2" />
                <path d="M120 20c0 0 18 24 10 48" stroke-width="1.6" />
              </g>
            </svg>
          </div>`}
    </section>

    <div class="hero-summary-wrap">
      <section class="points-summary">
        <div style="display:flex;gap:16px;align-items:center">
          <div class="paw-circle" aria-hidden="true">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7.5 6.5C8.88071 6.5 10 5.38071 10 4C10 2.61929 8.88071 1.5 7.5 1.5C6.11929 1.5 5 2.61929 5 4C5 5.38071 6.11929 6.5 7.5 6.5Z" fill="var(--paw-teal)"/><path d="M16.5 6.5C17.8807 6.5 19 5.38071 19 4C19 2.61929 17.8807 1.5 16.5 1.5C15.1193 1.5 14 2.61929 14 4C14 5.38071 15.1193 6.5 16.5 6.5Z" fill="var(--paw-teal)"/><path d="M12 13C14.7614 13 17 15.2386 17 18C17 20.7614 14.7614 23 12 23C9.23858 23 7 20.7614 7 18C7 15.2386 9.23858 13 12 13Z" fill="var(--paw-teal)"/></svg>
          </div>

          <div>
            <div class="rewards-label">PawPoints Rewards</div>
            <div class="rewards-balance">${customer.pointsBalance}</div>
            <div class="rewards-sub">Points available</div>
          </div>
        </div>

        <div style="text-align:right;min-width:260px">
          <a class="button button--outline" href="#rewards">View Rewards</a>
          <div class="rewards-progress">${escapeHtml(progressMessage)}</div>
        </div>
      </section>
    </div>

    <nav class="account-tabs" role="navigation" aria-label="Account tabs">
      <a href="#top" class="tab">Dashboard</a>
      <a href="https://${escapeHtml(shop)}/account/orders" class="tab">Orders</a>
      <a href="https://${escapeHtml(shop)}/account/addresses" class="tab">Addresses</a>
      <a href="#rewards" class="tab active">Rewards</a>
      <a href="https://${escapeHtml(shop)}/account" class="tab">Account</a>
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

    <section id="rewards" class="section">
      <div class="section-head">
        <div class="section-title-wrap">
          <span class="section-icon" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7" stroke="var(--paw-teal)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 3v7" stroke="var(--paw-teal)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>

          <div>
            <h2>Available rewards</h2>

            <p class="section-copy">
              Turn your Paw Points into exclusive PawMart savings.
            </p>
          </div>
        </div>
      </div>

      <div class="reward-grid">
        ${rewardsHtml}
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div class="section-title-wrap">
          <span class="section-icon" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 7v7a2 2 0 0 0 .586 1.414L12 23l8.414-7.586A2 2 0 0 0 21 14V7a2 2 0 0 0-2-2h-4" stroke="var(--paw-teal)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>

          <div>
            <h2>Your active codes</h2>

            <p class="section-copy">
              Copy a reward code and apply it during checkout.
            </p>
          </div>
        </div>
      </div>

      <div class="code-grid">
        ${codesHtml}
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div class="section-title-wrap">
          <span class="section-icon">🐾</span>

          <div>
            <h2>Points activity</h2>

            <p class="section-copy">
              Follow every point earned, redeemed, or adjusted.
            </p>
          </div>
        </div>
      </div>

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

          <tbody>
            ${transactionsHtml}
          </tbody>
        </table>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div class="section-title-wrap">
          <span class="section-icon">🧾</span>

          <div>
            <h2>Redemption history</h2>

            <p class="section-copy">
              Review your current and previous PawMart rewards.
            </p>
          </div>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Reward</th>
              <th>Points</th>
              <th>Code</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>

          <tbody>
            ${redemptionsHtml}
          </tbody>
        </table>
      </div>
    </section>
  `, shop);
}