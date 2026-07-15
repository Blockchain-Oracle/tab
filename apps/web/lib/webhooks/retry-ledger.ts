import { randomUUID } from "node:crypto";

import { and, asc, eq, isNull, lt, lte, sql } from "drizzle-orm";

import type { Database } from "../db/client";
import { webhookDeliveries } from "../db/schema";

export async function promoteDueWebhookRetry(db: Database) {
  return db.transaction(async (transaction) => {
    const [parent] = await transaction
      .select()
      .from(webhookDeliveries)
      .where(
        and(
          eq(webhookDeliveries.result, "retrying"),
          lte(webhookDeliveries.nextRetryAt, sql`clock_timestamp()`),
          isNull(webhookDeliveries.supersededById),
          lt(webhookDeliveries.attempt, 3),
        ),
      )
      .orderBy(
        asc(webhookDeliveries.nextRetryAt),
        asc(webhookDeliveries.createdAt),
        asc(webhookDeliveries.id),
      )
      .limit(1)
      .for("update", { skipLocked: true });
    if (!parent) return null;
    if (
      parent.failureKind !== "http" &&
      parent.failureKind !== "network" &&
      parent.failureKind !== "timeout"
    ) {
      throw new Error("Retryable webhook delivery has no retryable failure kind");
    }

    const id = randomUUID();
    const attempt = parent.attempt + 1;
    const [child] = await transaction
      .insert(webhookDeliveries)
      .values({
        attempt,
        endpointId: parent.endpointId,
        env: parent.env,
        eventId: parent.eventId,
        id,
        merchantId: parent.merchantId,
        parentAttempt: parent.attempt,
        parentDeliveryId: parent.id,
        paymentId: parent.paymentId,
        requestBody: parent.requestBody,
        result: "pending",
        retryChainId: parent.retryChainId,
        settlementId: parent.settlementId,
        trigger: parent.trigger,
        type: parent.type,
      })
      .returning();
    if (!child) throw new Error("Webhook retry insertion failed");

    const [updated] = await transaction
      .update(webhookDeliveries)
      .set({
        nextRetryAt: null,
        result: parent.failureKind === "timeout" ? "timeout" : "failed",
        supersededByAttempt: attempt,
        supersededById: child.id,
      })
      .where(
        and(
          eq(webhookDeliveries.id, parent.id),
          eq(webhookDeliveries.result, "retrying"),
          isNull(webhookDeliveries.supersededById),
        ),
      )
      .returning({ id: webhookDeliveries.id });
    if (!updated) throw new Error("Webhook retry promotion lost its locked parent");
    return child;
  });
}
