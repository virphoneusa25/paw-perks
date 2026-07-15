import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { processRefund } from "../loyalty.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic, webhookId } =
    await authenticate.webhook(request);

  console.log("Paw Perks refund webhook authenticated:", {
    shop,
    topic,
    webhookId,
  });

  if (topic !== "REFUNDS_CREATE") {
    console.warn(
      "Unexpected Paw Perks refund webhook topic:",
      topic,
    );

    return new Response("Unexpected webhook topic", {
      status: 400,
    });
  }

  try {
    const result = await processRefund(shop, payload);

    console.log("Paw Perks refund result:", {
      shop,
      webhookId,
      refundId:
        typeof payload === "object" &&
        payload !== null &&
        "id" in payload
          ? payload.id
          : undefined,
      orderId:
        typeof payload === "object" &&
        payload !== null &&
        "order_id" in payload
          ? payload.order_id
          : undefined,
      result,
    });

    return new Response("Refund processed", {
      status: 200,
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error("Paw Perks refund processing failed:", {
        name: error.name,
        message: error.message,
        stack: error.stack,
        shop,
        webhookId,
      });
    } else {
      console.error("Paw Perks refund processing failed:", {
        error,
        shop,
        webhookId,
      });
    }

    return new Response("Refund processing failed", {
      status: 500,
    });
  }
};