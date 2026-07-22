import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  MANUAL_WEBHOOK_RATE_LIMIT,
  withManualWebhookGrant,
} from "../dashboard/webhooks-manual-limit";
import { createDatabase } from "../db/client";
import { provisionMerchant } from "../db/provision-merchant";
import { payments, settlements, webhookDeliveries, webhookEndpoints } from "../db/schema";
import { reportPayment } from "../payments/payment-report";
import { processPaymentReportAfterCommit } from "../payments/payment-report-post-commit";
import { fakeTxHash, verifiedTestTransfer } from "../payments/verify-test-support";
import { enqueuePaymentSettledWebhook } from "./enqueue";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for webhook egress limit tests");

const connection = createDatabase(databaseUrl, 8);
const receiver = "0x1111111111111111111111111111111111111111";
const payer = "0x9999999999999999999999999999999999999999";
const token = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
type Environment = "live" | "test";

async function scope(env: Environment) {
  const identity = await provisionMerchant(connection.db, {
    email: `egress-${env}-${randomUUID()}@example.test`,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: receiver,
  });
  const endpointId = randomUUID();
  await connection.db.insert(webhookEndpoints).values({
    env,
    id: endpointId,
    merchantId: identity.merchantId,
    secretAuthTag: "A".repeat(22),
    secretCiphertext: "ciphertext",
    secretKeyVersion: 1,
    secretLast4: "last",
    secretNonce: "A".repeat(16),
    url: "https://merchant.example.test/webhook",
  });
  return { endpointId, env, merchantId: identity.merchantId };
}

async function manualRoot(principal: Awaited<ReturnType<typeof scope>>, completed: boolean) {
  const id = randomUUID();
  const completedValues = completed
    ? {
        completedAt: new Date(),
        responseTimeMs: 1,
        result: "delivered" as const,
        signatureHeader: `t=1700000000,v1=${"a".repeat(64)}`,
        startedAt: new Date(),
        statusCode: 204,
      }
    : {};
  await connection.db.insert(webhookDeliveries).values({
    ...completedValues,
    attempt: 1,
    endpointId: principal.endpointId,
    env: principal.env,
    eventId: `evt_${randomUUID().replaceAll("-", "")}`,
    id,
    merchantId: principal.merchantId,
    requestBody: `{"id":"${id}","type":"test","livemode":${principal.env === "live"}}`,
    retryChainId: id,
    trigger: "manual",
    type: "test",
  });
  return id;
}

async function pendingTestPayment(merchantId: string) {
  const [payment] = await connection.db
    .insert(payments)
    .values({
      amountUsd: "1.000000",
      currency: "USD",
      env: "test",
      intentUrl: "https://merchant.example.test/intent",
      livemode: false,
      merchantId,
      refCode: `TAB-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
      receiver,
      tokenAddress: token,
      tokenChainId: 42161,
    })
    .returning({ id: payments.id });
  if (!payment) throw new Error("Expected test payment");
  return payment.id;
}

async function reportTestPayment(principal: Awaited<ReturnType<typeof scope>>) {
  const paymentId = await pendingTestPayment(principal.merchantId);
  const result = await reportPayment(
    connection.db,
    { env: "test", merchantId: principal.merchantId },
    paymentId,
    { tokenChanges: [], transactionId: fakeTxHash() },
    { payerAddress: payer, payerEmail: "buyer@example.test" },
    verifiedTestTransfer,
  );
  return { paymentId, result };
}

async function markDelivered(id: string) {
  await connection.db
    .update(webhookDeliveries)
    .set({
      completedAt: new Date(),
      responseTimeMs: 1,
      result: "delivered",
      signatureHeader: `t=1700000000,v1=${"b".repeat(64)}`,
      startedAt: new Date(),
      statusCode: 204,
    })
    .where(eq(webhookDeliveries.id, id));
}

async function liveSettlement(principal: Awaited<ReturnType<typeof scope>>) {
  const transactionId = `particle_${randomUUID()}`;
  const settledAt = new Date();
  const [payment] = await connection.db
    .insert(payments)
    .values({
      amountUsd: "1.000000",
      currency: "USD",
      env: "live",
      intentUrl: "https://merchant.example.test/intent",
      livemode: true,
      merchantId: principal.merchantId,
      payerAddress: payer,
      refCode: `TAB-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
      reportedAt: settledAt,
      reportedTokenChanges: [],
      reportedTransactionId: transactionId,
      receiver,
      settledAt,
      status: "settled",
      tokenAddress: token,
      tokenChainId: 42161,
    })
    .returning();
  if (!payment) throw new Error("Expected live payment");
  const [settlement] = await connection.db
    .insert(settlements)
    .values({
      amountAtomic: "1000000",
      livemode: true,
      particleTransactionId: transactionId,
      paymentId: payment.id,
      tokenChangesJson: [],
      verificationMethod: "particle",
      verificationTrigger: "inline",
    })
    .returning();
  if (!settlement) throw new Error("Expected live settlement");
  return { payment, settlement };
}

beforeEach(async () => {
  await connection.client`truncate table users cascade`;
});

afterAll(async () => {
  await connection.client.end();
});

describe("test-mode webhook egress admission with real PostgreSQL", () => {
  it("shares the two-active-root budget atomically with manual sends", async () => {
    const principal = await scope("test");
    await manualRoot(principal, false);

    const reports = await Promise.all([reportTestPayment(principal), reportTestPayment(principal)]);
    const accepted = reports.filter((entry) => entry.result.webhookDeliveryId !== null);
    const denied = reports.find((entry) => entry.result.webhookDeliveryId === null);

    expect(accepted).toHaveLength(1);
    expect(denied).toBeDefined();
    expect(await connection.db.select().from(settlements)).toHaveLength(2);
    if (!denied) throw new Error("Expected an egress-limited settlement");
    await expect(
      processPaymentReportAfterCommit(connection.db, denied.paymentId, denied.result),
    ).resolves.toBeUndefined();
    expect(await connection.db.select().from(settlements)).toHaveLength(2);
  });

  it("shares the ten-root window in both directions without rolling back settlement", async () => {
    const principal = await scope("test");
    for (let index = 1; index < MANUAL_WEBHOOK_RATE_LIMIT; index += 1) {
      await manualRoot(principal, true);
    }
    const admitted = await reportTestPayment(principal);
    expect(admitted.result.webhookDeliveryId).not.toBeNull();
    await markDelivered(String(admitted.result.webhookDeliveryId));

    await expect(
      withManualWebhookGrant(connection.db, principal, async () => "unexpected"),
    ).rejects.toMatchObject({ code: "WEBHOOK_RATE_LIMITED" });

    const limited = await reportTestPayment(principal);
    expect(limited.result.webhookDeliveryId).toBeNull();
    await processPaymentReportAfterCommit(connection.db, limited.paymentId, limited.result);
    const stored = await connection.db
      .select({ status: payments.status })
      .from(payments)
      .where(eq(payments.id, limited.paymentId));
    expect(stored[0]?.status).toBe("settled");
  });

  it("never applies the test limiter to live automatic fulfillment", async () => {
    const principal = await scope("live");
    for (let index = 0; index < MANUAL_WEBHOOK_RATE_LIMIT; index += 1) {
      await manualRoot(principal, true);
    }
    const { payment, settlement } = await liveSettlement(principal);
    const deliveryId = await connection.db.transaction((transaction) =>
      enqueuePaymentSettledWebhook(transaction, payment, settlement),
    );
    expect(deliveryId).toEqual(expect.any(String));
  });
});
