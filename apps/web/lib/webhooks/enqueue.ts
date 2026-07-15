import { randomUUID } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import type { Database } from "../db/client";
import { type payments, type settlements, webhookDeliveries, webhookEndpoints } from "../db/schema";
import { createWebhookEventId, serializePaymentSettledPayload } from "./payload";

type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function lockActiveWebhookEndpoint(
  transaction: DatabaseTransaction,
  merchantId: string,
  env: "live" | "test",
) {
  const [endpoint] = await transaction
    .select({ id: webhookEndpoints.id })
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.merchantId, merchantId),
        eq(webhookEndpoints.env, env),
        isNull(webhookEndpoints.deletedAt),
      ),
    )
    .limit(1)
    .for("share");
  return endpoint ?? null;
}

export async function findPaymentWebhookDeliveryId(
  transaction: DatabaseTransaction,
  settlementId: string,
) {
  const [delivery] = await transaction
    .select({ id: webhookDeliveries.id })
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.settlementId, settlementId),
        eq(webhookDeliveries.type, "payment"),
        eq(webhookDeliveries.trigger, "auto"),
        eq(webhookDeliveries.attempt, 1),
      ),
    )
    .limit(1);
  return delivery?.id ?? null;
}

export async function enqueuePaymentSettledWebhook(
  transaction: DatabaseTransaction,
  payment: typeof payments.$inferSelect,
  settlement: typeof settlements.$inferSelect,
) {
  const existingId = await findPaymentWebhookDeliveryId(transaction, settlement.id);
  if (existingId) return existingId;
  const endpoint = await lockActiveWebhookEndpoint(transaction, payment.merchantId, payment.env);
  if (!endpoint) return null;

  const id = randomUUID();
  const eventId = createWebhookEventId();
  const requestBody = serializePaymentSettledPayload({
    id,
    livemode: settlement.livemode,
    tokenChanges: settlement.tokenChangesJson,
    transactionId: settlement.particleTransactionId,
  });
  const [delivery] = await transaction
    .insert(webhookDeliveries)
    .values({
      attempt: 1,
      endpointId: endpoint.id,
      env: payment.env,
      eventId,
      id,
      merchantId: payment.merchantId,
      paymentId: payment.id,
      requestBody,
      result: "pending",
      retryChainId: id,
      settlementId: settlement.id,
      trigger: "auto",
      type: "payment",
    })
    .onConflictDoNothing()
    .returning({ id: webhookDeliveries.id });
  if (delivery) return delivery.id;
  const concurrentId = await findPaymentWebhookDeliveryId(transaction, settlement.id);
  if (!concurrentId) throw new Error("Webhook enqueue failed");
  return concurrentId;
}
