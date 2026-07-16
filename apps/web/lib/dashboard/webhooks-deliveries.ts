import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { Database } from "../db/client";
import { webhookDeliveries } from "../db/schema";
import { dispatchWebhookDeliveryById } from "../webhooks/deliver";
import { createWebhookEventId } from "../webhooks/payload";
import {
  loadActiveWebhookEndpoint,
  type WebhookDashboardPrincipal,
  webhookEndpointView,
} from "./webhooks-endpoints";
import { WebhookDashboardError } from "./webhooks-http";
import { withManualWebhookGrant } from "./webhooks-manual-limit";

function serializeTestPayload(id: string, livemode: boolean) {
  return `{"id":${JSON.stringify(id)},"type":"test","livemode":${livemode}}`;
}

export async function sendDashboardTestWebhook(
  db: Database,
  principal: WebhookDashboardPrincipal,
  options: { allowLocalHttp?: boolean } = {},
) {
  const id = randomUUID();
  const pending = await withManualWebhookGrant(db, principal, async (transaction) => {
    const endpoint = await loadActiveWebhookEndpoint(transaction, principal);
    if (!endpoint) {
      throw new WebhookDashboardError(
        "WEBHOOK_ENDPOINT_NOT_FOUND",
        "Create a webhook endpoint before sending a test.",
        404,
      );
    }
    const [inserted] = await transaction
      .insert(webhookDeliveries)
      .values({
        attempt: 1,
        endpointId: endpoint.id,
        env: principal.env,
        eventId: createWebhookEventId(),
        id,
        merchantId: principal.merchantId,
        requestBody: serializeTestPayload(id, principal.env === "live"),
        result: "pending",
        retryChainId: id,
        trigger: "manual",
        type: "test",
      })
      .returning({ id: webhookDeliveries.id });
    return inserted;
  });
  if (!pending) throw new Error("Test webhook insertion failed");

  await dispatchWebhookDeliveryById(db, id, options);
  const [delivery] = await db
    .select()
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.id, id),
        eq(webhookDeliveries.merchantId, principal.merchantId),
        eq(webhookDeliveries.env, principal.env),
      ),
    );
  if (!delivery) throw new Error("Test webhook delivery disappeared");

  const current = await loadActiveWebhookEndpoint(db, principal);
  return {
    delivery,
    endpoint: current ? await webhookEndpointView(db, current) : null,
  };
}
