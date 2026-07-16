import { and, asc, desc, eq, isNull } from "drizzle-orm";

import type { Database } from "../db/client";
import {
  apiKeys,
  merchants,
  payments,
  quickstartProgress,
  settlements,
  webhookDeliveries,
  webhookEndpoints,
} from "../db/schema";

export const QUICKSTART_STEPS = [
  { completion: "manual", key: "install", title: "Install the SDK" },
  { completion: "derived", key: "create_api_key", title: "Create your API key" },
  { completion: "manual", key: "intent_endpoint", title: "Create your intent endpoint" },
  { completion: "manual", key: "add_pay_button", title: "Add the pay button" },
  { completion: "derived", key: "configure_webhook", title: "Configure your webhook" },
  { completion: "derived", key: "verify_webhook", title: "Verify webhook delivery" },
  { completion: "derived", key: "test_payment", title: "Make a test payment" },
  { completion: "derived", key: "go_live", title: "Go live" },
] as const;

export type QuickstartStepKey = (typeof QUICKSTART_STEPS)[number]["key"];

const manualSteps = new Set<QuickstartStepKey>(["install", "intent_endpoint", "add_pay_button"]);

export class QuickstartStepNotManualError extends Error {
  readonly code = "QUICKSTART_STEP_NOT_MANUAL";

  constructor() {
    super("This Quickstart step is completed by a real integration event.");
    this.name = "QuickstartStepNotManualError";
  }
}

export function isQuickstartStepKey(value: unknown): value is QuickstartStepKey {
  return QUICKSTART_STEPS.some((step) => step.key === value);
}

export async function completeQuickstartStep(
  db: Database,
  merchantId: string,
  stepKey: QuickstartStepKey,
) {
  if (!manualSteps.has(stepKey)) throw new QuickstartStepNotManualError();

  const [row] = await db
    .insert(quickstartProgress)
    .values({ doneAt: new Date(), merchantId, source: "manual", stepKey })
    .onConflictDoUpdate({
      set: { doneAt: new Date(), source: "manual" },
      target: [quickstartProgress.merchantId, quickstartProgress.stepKey],
    })
    .returning({ doneAt: quickstartProgress.doneAt, stepKey: quickstartProgress.stepKey });
  if (!row) throw new Error("Quickstart progress was not stored");
  return row;
}

export async function readQuickstart(db: Database, merchantId: string) {
  const [manual, secretKey, publishableKey, endpoint, firstPayment, merchant] = await Promise.all([
    db
      .select({ stepKey: quickstartProgress.stepKey })
      .from(quickstartProgress)
      .where(eq(quickstartProgress.merchantId, merchantId)),
    db
      .select({ last4: apiKeys.last4, prefix: apiKeys.prefix })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.merchantId, merchantId),
          eq(apiKeys.env, "test"),
          eq(apiKeys.type, "secret"),
          isNull(apiKeys.revokedAt),
        ),
      )
      .orderBy(desc(apiKeys.createdAt))
      .limit(1),
    db
      .select({ value: apiKeys.publicKey })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.merchantId, merchantId),
          eq(apiKeys.env, "test"),
          eq(apiKeys.type, "publishable"),
          isNull(apiKeys.revokedAt),
        ),
      )
      .limit(1),
    db
      .select({ url: webhookEndpoints.url, verifiedAt: webhookEndpoints.verifiedAt })
      .from(webhookEndpoints)
      .where(
        and(
          eq(webhookEndpoints.merchantId, merchantId),
          eq(webhookEndpoints.env, "test"),
          isNull(webhookEndpoints.deletedAt),
        ),
      )
      .limit(1),
    db
      .select({
        amountUsd: payments.amountUsd,
        paymentId: payments.id,
        responseTimeMs: webhookDeliveries.responseTimeMs,
        settledAt: payments.settledAt,
        webhookResult: webhookDeliveries.result,
      })
      .from(payments)
      .innerJoin(settlements, eq(settlements.paymentId, payments.id))
      .leftJoin(
        webhookDeliveries,
        and(
          eq(webhookDeliveries.paymentId, payments.id),
          eq(webhookDeliveries.type, "payment"),
          eq(webhookDeliveries.trigger, "auto"),
        ),
      )
      .where(
        and(
          eq(payments.merchantId, merchantId),
          eq(payments.env, "test"),
          eq(payments.status, "settled"),
        ),
      )
      .orderBy(asc(payments.settledAt), desc(webhookDeliveries.attempt))
      .limit(1),
    db
      .select({
        liveActivatedAt: merchants.liveActivatedAt,
        receivingAddress: merchants.receivingAddress,
      })
      .from(merchants)
      .where(eq(merchants.id, merchantId))
      .limit(1),
  ]);

  const manualDone = new Set(manual.map((row) => row.stepKey));
  const key = secretKey[0];
  const webhook = endpoint[0];
  const payment = firstPayment[0];
  const owner = merchant[0];
  const derivedDone: Partial<Record<QuickstartStepKey, boolean>> = {
    configure_webhook: Boolean(webhook),
    create_api_key: Boolean(key),
    go_live: Boolean(owner?.liveActivatedAt),
    test_payment: Boolean(payment),
    verify_webhook: Boolean(webhook?.verifiedAt),
  };
  const steps = QUICKSTART_STEPS.map((step) => ({
    ...step,
    done: step.completion === "manual" ? manualDone.has(step.key) : Boolean(derivedDone[step.key]),
  }));

  return {
    completedCount: steps.filter((step) => step.done).length,
    firstTestPayment: payment
      ? {
          amountUsd: payment.amountUsd,
          responseTimeMs: payment.responseTimeMs,
          webhookResult: payment.webhookResult,
        }
      : null,
    maskedSecretKey: key ? `${key.prefix}${"•".repeat(8)}${key.last4}` : null,
    publishableKey: publishableKey[0]?.value ?? null,
    receivingAddress: owner?.receivingAddress ?? null,
    steps,
    webhookUrl: webhook?.url ?? null,
  };
}
