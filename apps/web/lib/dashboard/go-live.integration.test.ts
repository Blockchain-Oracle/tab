import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { hashApiKey } from "../auth/api-key";
import { createDatabase } from "../db/client";
import { provisionMerchant } from "../db/provision-merchant";
import { apiKeys, merchants, payments, settlements, webhookEndpoints } from "../db/schema";
import { activateLiveMode, readGoLiveReadiness } from "./go-live";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for Go Live integration tests");

const connection = createDatabase(databaseUrl, 1);

async function merchant() {
  return provisionMerchant(connection.db, {
    email: `go-live-${randomUUID()}@example.test`,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x1111111111111111111111111111111111111111",
  });
}

describe("Go Live readiness with real PostgreSQL", () => {
  beforeEach(async () => {
    await connection.client`truncate table users cascade`;
  });

  afterAll(async () => {
    await connection.client.end();
  });

  it("derives all three checks from active tenant records", async () => {
    const identity = await merchant();
    expect(await readGoLiveReadiness(connection.db, identity.merchantId)).toEqual({
      liveApiKey: false,
      ready: false,
      testPayment: false,
      verifiedWebhook: false,
    });

    const readOnlyKey = `sk_live_${randomUUID().replaceAll("-", "")}`;
    await connection.db.insert(apiKeys).values({
      env: "live",
      last4: readOnlyKey.slice(-4),
      merchantId: identity.merchantId,
      name: "Production reader",
      permissions: "read_only",
      prefix: "sk_live_",
      secretHash: hashApiKey(readOnlyKey),
      type: "secret",
    });
    expect(await readGoLiveReadiness(connection.db, identity.merchantId)).toMatchObject({
      liveApiKey: false,
      ready: false,
    });

    const rawKey = `sk_live_${randomUUID().replaceAll("-", "")}`;
    await connection.db.insert(apiKeys).values({
      env: "live",
      last4: rawKey.slice(-4),
      merchantId: identity.merchantId,
      name: "Production server",
      permissions: "full",
      prefix: "sk_live_",
      secretHash: hashApiKey(rawKey),
      type: "secret",
    });
    await connection.db.insert(webhookEndpoints).values({
      env: "test",
      merchantId: identity.merchantId,
      secretAuthTag: "AAAAAAAAAAAAAAAAAAAAAA",
      secretCiphertext: "ciphertext",
      secretKeyVersion: 1,
      secretLast4: "last",
      secretNonce: "AAAAAAAAAAAAAAAA",
      url: "https://merchant.example.test/webhooks/tab",
      verifiedAt: new Date(),
    });
    const transactionId = `test_${randomUUID()}`;
    const [payment] = await connection.db
      .insert(payments)
      .values({
        amountUsd: "1.000000",
        currency: "USD",
        env: "test",
        intentUrl: "https://merchant.example.test/intent",
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
    if (!payment) throw new Error("Expected a payment row");

    expect(await readGoLiveReadiness(connection.db, identity.merchantId)).toMatchObject({
      ready: false,
      testPayment: false,
    });

    await connection.db.insert(settlements).values({
      amountAtomic: "1000000",
      livemode: false,
      particleTransactionId: transactionId,
      paymentId: payment.id,
      tokenChangesJson: [],
      verificationMethod: "simulated_test",
      verificationTrigger: "inline",
    });

    expect(await readGoLiveReadiness(connection.db, identity.merchantId)).toEqual({
      liveApiKey: true,
      ready: true,
      testPayment: true,
      verifiedWebhook: true,
    });
  });

  it("requires explicit acknowledgement before warn-and-allow activation", async () => {
    const identity = await merchant();

    await expect(
      activateLiveMode(connection.db, identity.merchantId, { acknowledgeIncomplete: false }),
    ).rejects.toMatchObject({ code: "GO_LIVE_ACKNOWLEDGEMENT_REQUIRED" });
    const activated = await activateLiveMode(connection.db, identity.merchantId, {
      acknowledgeIncomplete: true,
    });

    expect(activated.liveActivatedAt).toBeInstanceOf(Date);
    const [stored] = await connection.db
      .select({ liveActivatedAt: merchants.liveActivatedAt })
      .from(merchants)
      .where(eq(merchants.id, identity.merchantId));
    expect(stored?.liveActivatedAt).toBeInstanceOf(Date);
  });
});
