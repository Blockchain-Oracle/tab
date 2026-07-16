import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import type { Database } from "../db/client";
import { webhookDeliveries } from "../db/schema";
import { dispatchWebhookDeliveryById } from "../webhooks/deliver";
import { loadActiveWebhookEndpoint, type WebhookDashboardPrincipal } from "./webhooks-endpoints";
import { WebhookDashboardError } from "./webhooks-http";
import { withManualWebhookGrant } from "./webhooks-manual-limit";

const DELIVERY_LIMIT = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function deliveryView(delivery: typeof webhookDeliveries.$inferSelect) {
  return {
    attempt: delivery.attempt,
    completedAt: delivery.completedAt,
    createdAt: delivery.createdAt,
    eventId: delivery.eventId,
    failureKind: delivery.failureKind,
    id: delivery.id,
    nextRetryAt: delivery.nextRetryAt,
    parentDeliveryId: delivery.parentDeliveryId,
    request: {
      body: delivery.requestBody,
      bodyHash: delivery.requestBodyHash,
      signature: delivery.signatureHeader,
    },
    response: {
      bodySnippet: delivery.responseBodySnippet,
      statusCode: delivery.statusCode,
      timeMs: delivery.responseTimeMs,
    },
    result: delivery.result,
    retryChainId: delivery.retryChainId,
    startedAt: delivery.startedAt,
    trigger: delivery.trigger,
    type: delivery.type,
  };
}

export type DashboardWebhookDelivery = ReturnType<typeof deliveryView>;

export async function listDashboardWebhookDeliveries(
  db: Database,
  principal: WebhookDashboardPrincipal,
) {
  const rows = await db
    .select()
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.merchantId, principal.merchantId),
        eq(webhookDeliveries.env, principal.env),
      ),
    )
    .orderBy(desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id))
    .limit(DELIVERY_LIMIT);
  return rows.map(deliveryView);
}

function sourceRequired(source: typeof webhookDeliveries.$inferSelect | undefined) {
  if (!source) {
    throw new WebhookDashboardError(
      "WEBHOOK_DELIVERY_NOT_FOUND",
      "Webhook delivery not found in this environment.",
      404,
    );
  }
  if (source.result === "pending" || source.result === "retrying") {
    throw new WebhookDashboardError(
      "WEBHOOK_DELIVERY_IN_FLIGHT",
      "Wait for the current delivery attempt before resending.",
      409,
    );
  }
  return source;
}

export async function resendDashboardWebhookDelivery(
  db: Database,
  principal: WebhookDashboardPrincipal,
  sourceId: string,
  options: { allowLocalHttp?: boolean } = {},
) {
  if (!UUID_PATTERN.test(sourceId)) return sourceRequired(undefined);
  const [sourceRow] = await db
    .select()
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.id, sourceId),
        eq(webhookDeliveries.merchantId, principal.merchantId),
        eq(webhookDeliveries.env, principal.env),
      ),
    )
    .limit(1);
  const source = sourceRequired(sourceRow);
  const endpoint = await loadActiveWebhookEndpoint(db, principal);
  if (!endpoint || endpoint.id !== source.endpointId) {
    throw new WebhookDashboardError(
      "WEBHOOK_ENDPOINT_CHANGED",
      "This attempt belongs to an endpoint that is no longer active.",
      409,
    );
  }

  const id = randomUUID();
  const pending = await withManualWebhookGrant(db, principal, async (transaction) => {
    const [inserted] = await transaction
      .insert(webhookDeliveries)
      .values({
        attempt: 1,
        endpointId: source.endpointId,
        env: source.env,
        eventId: source.eventId,
        id,
        merchantId: source.merchantId,
        parentDeliveryId: source.id,
        paymentId: source.paymentId,
        requestBody: source.requestBody,
        result: "pending",
        retryChainId: id,
        settlementId: source.settlementId,
        trigger: "manual",
        type: source.type,
      })
      .returning({ id: webhookDeliveries.id });
    return inserted;
  });
  if (!pending) throw new Error("Manual webhook delivery insertion failed");

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
  if (!delivery) throw new Error("Manual webhook delivery disappeared");
  return deliveryView(delivery);
}
