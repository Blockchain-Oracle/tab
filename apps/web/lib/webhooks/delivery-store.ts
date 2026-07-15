import { randomUUID } from "node:crypto";

import { and, asc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";

import type { Database } from "../db/client";
import { webhookDeliveries } from "../db/schema";

const DEFAULT_LEASE_MS = 30_000;

interface CompletedAttempt {
  completedAt: Date;
  responseBodySnippet: string | null;
  responseTimeMs: number;
  signatureHeader: string;
}

type FailedAttempt =
  | { failureKind: "http"; statusCode: number }
  | { failureKind: "network" | "timeout"; statusCode: null };

export type WebhookDeliveryOutcome =
  | (CompletedAttempt & { result: "delivered"; statusCode: number })
  | (CompletedAttempt &
      FailedAttempt & {
        nextRetryAt: Date;
        result: "retrying";
      })
  | { completedAt: Date; result: "configuration" }
  | (CompletedAttempt & FailedAttempt & { result: "gave_up" });

type DeliveryUpdate = Partial<typeof webhookDeliveries.$inferInsert>;

function requireLeaseDuration(leaseMs: number) {
  if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0) {
    throw new Error("Webhook delivery lease must be a positive integer");
  }
}

function finalValues(outcome: WebhookDeliveryOutcome): DeliveryUpdate {
  const lease = { leaseExpiresAt: null, leaseToken: null };
  if (outcome.result === "configuration") {
    return {
      ...lease,
      completedAt: outcome.completedAt,
      failureKind: "configuration",
      nextRetryAt: null,
      responseBodySnippet: null,
      responseTimeMs: null,
      result: "failed",
      signatureHeader: null,
      statusCode: null,
    };
  }

  const attempt = {
    ...lease,
    completedAt: outcome.completedAt,
    failureKind: outcome.result === "delivered" ? null : outcome.failureKind,
    nextRetryAt: outcome.result === "retrying" ? outcome.nextRetryAt : null,
    responseBodySnippet: outcome.responseBodySnippet,
    responseTimeMs: outcome.responseTimeMs,
    result: outcome.result,
    signatureHeader: outcome.signatureHeader,
    statusCode: outcome.statusCode,
  };
  return attempt;
}

export async function findClaimableWebhookDeliveryId(db: Database) {
  const [delivery] = await db
    .select({ id: webhookDeliveries.id })
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.result, "pending"),
        or(
          isNull(webhookDeliveries.leaseToken),
          lte(webhookDeliveries.leaseExpiresAt, sql`clock_timestamp()`),
        ),
      ),
    )
    .orderBy(asc(webhookDeliveries.createdAt), asc(webhookDeliveries.id))
    .limit(1);
  return delivery?.id ?? null;
}

export async function claimWebhookDelivery(db: Database, id: string, leaseMs = DEFAULT_LEASE_MS) {
  requireLeaseDuration(leaseMs);
  const leaseToken = randomUUID();
  const [claimed] = await db
    .update(webhookDeliveries)
    .set({
      leaseExpiresAt: sql`clock_timestamp() + (${leaseMs} * interval '1 millisecond')`,
      leaseToken,
      signatureHeader: null,
      startedAt: sql`clock_timestamp()`,
    })
    .where(
      and(
        eq(webhookDeliveries.id, id),
        eq(webhookDeliveries.result, "pending"),
        or(
          isNull(webhookDeliveries.leaseToken),
          lte(webhookDeliveries.leaseExpiresAt, sql`clock_timestamp()`),
        ),
      ),
    )
    .returning();
  return claimed ?? null;
}

export async function armWebhookDelivery(
  db: Database,
  id: string,
  leaseToken: string,
  signatureHeader: string,
  leaseMs = DEFAULT_LEASE_MS,
) {
  requireLeaseDuration(leaseMs);
  const [armed] = await db
    .update(webhookDeliveries)
    .set({
      leaseExpiresAt: sql`clock_timestamp() + (${leaseMs} * interval '1 millisecond')`,
      signatureHeader,
      startedAt: sql`clock_timestamp()`,
    })
    .where(
      and(
        eq(webhookDeliveries.id, id),
        eq(webhookDeliveries.result, "pending"),
        eq(webhookDeliveries.leaseToken, leaseToken),
        gt(webhookDeliveries.leaseExpiresAt, sql`clock_timestamp()`),
      ),
    )
    .returning({ id: webhookDeliveries.id });
  return Boolean(armed);
}

export async function finalizeWebhookDelivery(
  db: Database,
  id: string,
  leaseToken: string,
  outcome: WebhookDeliveryOutcome,
) {
  const [finalized] = await db
    .update(webhookDeliveries)
    .set(finalValues(outcome))
    .where(
      and(
        eq(webhookDeliveries.id, id),
        eq(webhookDeliveries.result, "pending"),
        eq(webhookDeliveries.leaseToken, leaseToken),
      ),
    )
    .returning({ id: webhookDeliveries.id });
  return Boolean(finalized);
}
