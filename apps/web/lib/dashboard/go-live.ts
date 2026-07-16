import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";

import type { Database } from "../db/client";
import { apiKeys, merchants, payments, settlements, webhookEndpoints } from "../db/schema";

export interface GoLiveReadiness {
  liveApiKey: boolean;
  ready: boolean;
  testPayment: boolean;
  verifiedWebhook: boolean;
}

export class GoLiveAcknowledgementRequiredError extends Error {
  readonly code = "GO_LIVE_ACKNOWLEDGEMENT_REQUIRED";

  constructor() {
    super("Review and acknowledge the incomplete Go Live checklist.");
    this.name = "GoLiveAcknowledgementRequiredError";
  }
}

export async function readGoLiveReadiness(
  db: Database,
  merchantId: string,
): Promise<GoLiveReadiness> {
  const [key, endpoint, payment] = await Promise.all([
    db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.merchantId, merchantId),
          eq(apiKeys.env, "live"),
          eq(apiKeys.type, "secret"),
          eq(apiKeys.permissions, "full"),
          isNull(apiKeys.revokedAt),
        ),
      )
      .limit(1),
    db
      .select({ id: webhookEndpoints.id })
      .from(webhookEndpoints)
      .where(
        and(
          eq(webhookEndpoints.merchantId, merchantId),
          eq(webhookEndpoints.env, "test"),
          isNull(webhookEndpoints.deletedAt),
          isNotNull(webhookEndpoints.verifiedAt),
        ),
      )
      .limit(1),
    db
      .select({ id: payments.id })
      .from(payments)
      .innerJoin(settlements, eq(settlements.paymentId, payments.id))
      .where(
        and(
          eq(payments.merchantId, merchantId),
          eq(payments.env, "test"),
          eq(payments.status, "settled"),
          eq(settlements.livemode, false),
          eq(settlements.verificationMethod, "simulated_test"),
        ),
      )
      .limit(1),
  ]);
  const readiness = {
    liveApiKey: key.length > 0,
    testPayment: payment.length > 0,
    verifiedWebhook: endpoint.length > 0,
  };
  return { ...readiness, ready: Object.values(readiness).every(Boolean) };
}

export async function activateLiveMode(
  db: Database,
  merchantId: string,
  options: { acknowledgeIncomplete: boolean },
) {
  const readiness = await readGoLiveReadiness(db, merchantId);
  if (!readiness.ready && !options.acknowledgeIncomplete) {
    throw new GoLiveAcknowledgementRequiredError();
  }

  const [merchant] = await db
    .update(merchants)
    .set({ liveActivatedAt: sql`coalesce(${merchants.liveActivatedAt}, clock_timestamp())` })
    .where(eq(merchants.id, merchantId))
    .returning({ liveActivatedAt: merchants.liveActivatedAt });
  if (!merchant?.liveActivatedAt) throw new Error("Merchant was not found");
  return { liveActivatedAt: merchant.liveActivatedAt, readiness };
}
