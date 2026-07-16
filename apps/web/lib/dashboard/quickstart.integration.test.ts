import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { hashApiKey } from "../auth/api-key";
import { createDatabase } from "../db/client";
import { provisionMerchant } from "../db/provision-merchant";
import { apiKeys, payments, settlements, webhookDeliveries, webhookEndpoints } from "../db/schema";
import { completeQuickstartStep, QuickstartStepNotManualError, readQuickstart } from "./quickstart";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for Quickstart integration tests");

const connection = createDatabase(databaseUrl, 1);

async function merchant(label: string) {
  return provisionMerchant(connection.db, {
    email: `${label}-${randomUUID()}@example.test`,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x1111111111111111111111111111111111111111",
  });
}

describe("Quickstart progress with real PostgreSQL", () => {
  beforeEach(async () => {
    await connection.client`truncate table users cascade`;
  });

  afterAll(async () => {
    await connection.client.end();
  });

  it("keeps install manual and derives key, webhook, and payment progress from tenant rows", async () => {
    const identity = await merchant("quickstart");
    const empty = await readQuickstart(connection.db, identity.merchantId);

    expect(empty.completedCount).toBe(0);
    expect(empty.steps).toHaveLength(8);
    expect(empty.steps.find((step) => step.key === "install")).toMatchObject({
      completion: "manual",
      done: false,
    });

    await completeQuickstartStep(connection.db, identity.merchantId, "install");
    const rawKey = `sk_test_${randomUUID().replaceAll("-", "")}`;
    await connection.db.insert(apiKeys).values({
      env: "test",
      last4: rawKey.slice(-4),
      merchantId: identity.merchantId,
      name: "Server key",
      permissions: "full",
      prefix: "sk_test_",
      secretHash: hashApiKey(rawKey),
      type: "secret",
    });
    const [endpoint] = await connection.db
      .insert(webhookEndpoints)
      .values({
        env: "test",
        merchantId: identity.merchantId,
        secretAuthTag: "AAAAAAAAAAAAAAAAAAAAAA",
        secretCiphertext: "ciphertext",
        secretKeyVersion: 1,
        secretLast4: "last",
        secretNonce: "AAAAAAAAAAAAAAAA",
        url: "https://merchant.example.test/webhooks/tab",
      })
      .returning({ id: webhookEndpoints.id });
    if (!endpoint) throw new Error("Expected a webhook endpoint");
    const transactionId = `test_${randomUUID()}`;
    const [payment] = await connection.db
      .insert(payments)
      .values({
        amountUsd: "12.000000",
        currency: "USD",
        env: "test",
        intentUrl: "https://merchant.example.test/api/tab/intent",
        livemode: false,
        merchantId: identity.merchantId,
        refCode: `TAB-${randomUUID().slice(0, 8).toUpperCase()}`,
        receiver: "0x1111111111111111111111111111111111111111",
        reportedAt: new Date(),
        reportedTokenChanges: [],
        reportedTransactionId: transactionId,
        settledAt: new Date(),
        status: "settled",
        tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        tokenChainId: 42161,
      })
      .returning({ id: payments.id });
    if (!payment) throw new Error("Expected a settled payment");
    const [settlement] = await connection.db
      .insert(settlements)
      .values({
        amountAtomic: "12000000",
        livemode: false,
        particleTransactionId: transactionId,
        paymentId: payment.id,
        tokenChangesJson: [],
        verificationMethod: "simulated_test",
        verificationTrigger: "inline",
      })
      .returning({ id: settlements.id });
    if (!settlement) throw new Error("Expected a settlement row");
    const deliveryId = randomUUID();
    await connection.db.insert(webhookDeliveries).values({
      attempt: 1,
      completedAt: new Date(),
      endpointId: endpoint.id,
      env: "test",
      eventId: `evt_${randomUUID().replaceAll("-", "")}`,
      failureKind: "http",
      id: deliveryId,
      merchantId: identity.merchantId,
      nextRetryAt: new Date(Date.now() + 60_000),
      paymentId: payment.id,
      requestBody: "{}",
      responseTimeMs: 42,
      result: "retrying",
      retryChainId: deliveryId,
      settlementId: settlement.id,
      signatureHeader: `t=1,v1=${"a".repeat(64)}`,
      startedAt: new Date(),
      statusCode: 500,
      trigger: "auto",
      type: "payment",
    });

    const progress = await readQuickstart(connection.db, identity.merchantId);
    expect(progress.completedCount).toBe(4);
    expect(progress.maskedSecretKey).toMatch(/^sk_test_•{8}[A-Za-z0-9_-]{4}$/);
    expect(progress.webhookUrl).toBe("https://merchant.example.test/webhooks/tab");
    expect(progress.firstTestPayment).toMatchObject({
      amountUsd: "12.000000",
      responseTimeMs: 42,
      webhookResult: "retrying",
    });
  });

  it("rejects manual completion for database-derived steps and cross-tenant progress", async () => {
    const first = await merchant("quickstart-first");
    const second = await merchant("quickstart-second");

    await expect(
      completeQuickstartStep(connection.db, first.merchantId, "create_api_key"),
    ).rejects.toBeInstanceOf(QuickstartStepNotManualError);
    await completeQuickstartStep(connection.db, first.merchantId, "intent_endpoint");

    expect((await readQuickstart(connection.db, first.merchantId)).completedCount).toBe(1);
    expect((await readQuickstart(connection.db, second.merchantId)).completedCount).toBe(0);
  });
});
