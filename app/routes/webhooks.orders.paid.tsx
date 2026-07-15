import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { processPaidOrder } from "../loyalty.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic, webhookId } =
    await authenticate.webhook(request);

  console.log("Paw Perks webhook authenticated:", {
    shop,
    topic,
    webhookId,
  });

  if (topic !== "ORDERS_PAID") {
    console.warn("Unexpected Paw Perks webhook topic:", topic);

    return new Response("Unexpected webhook topic", {
      status: 400,
    });
  }

  try {
    const result = await processPaidOrder(shop, payload);

    console.log("Paw Perks paid-order result:", {
      shop,
      webhookId,
      orderId:
        typeof payload === "object" &&
        payload !== null &&
        "id" in payload
          ? payload.id
          : undefined,
      result,
    });

    return new Response("Webhook processed", {
      status: 200,
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error("Paw Perks loyalty processing failed:", {
        name: error.name,
        message: error.message,
        stack: error.stack,
        shop,
        webhookId,
      });
    } else {
      console.error("Paw Perks loyalty processing failed:", {
        error,
        shop,
        webhookId,
      });
    }

    return new Response("Loyalty processing failed", {
      status: 500,
    });
  }
};