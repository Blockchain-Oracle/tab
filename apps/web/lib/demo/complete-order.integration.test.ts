import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import { provisionMerchant } from "../db/provision-merchant";
import { merchants, orders, payments, settlements } from "../db/schema";
import { completeDemoOrder, DemoPaymentNotFoundError } from "./complete-order";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for demo-order integration tests");
const connection = createDatabase(databaseUrl, 2);

async function merchant(name: string) {
  const identity = await provisionMerchant(connection.db, {
    email: `demo-order-${randomUUID()}@example.test`,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x1111111111111111111111111111111111111111",
  });
  await connection.db
    .update(merchants)
    .set({ businessName: name })
    .where(eq(merchants.id, identity.merchantId));
  return identity;
}

async function settledPayment(merchantId: string) {
  const transactionId = `test_${randomUUID()}`;
  const [payment] = await connection.db
    .insert(payments)
    .values({
      amountUsd: "1.000000",
      currency: "USD",
      env: "test",
      intentUrl: "https://tab.example.test/api/demo/intent",
      livemode: false,
      merchantId,
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
  if (!payment) throw new Error("Expected a payment");
  await connection.db.insert(settlements).values({
    amountAtomic: "1000000",
    livemode: false,
    particleTransactionId: transactionId,
    paymentId: payment.id,
    tokenChangesJson: [],
    verificationMethod: "simulated_test",
    verificationTrigger: "inline",
  });
  return transactionId;
}

describe("demo order completion with real PostgreSQL", () => {
  beforeEach(async () => {
    await connection.client`truncate table users cascade`;
  });

  afterAll(async () => {
    await connection.client.end();
  });

  it("derives sequential tenant prefixes and is idempotent per payment", async () => {
    const identity = await merchant("North Shore Supply");
    const firstTransaction = await settledPayment(identity.merchantId);
    const secondTransaction = await settledPayment(identity.merchantId);

    const first = await completeDemoOrder(connection.db, identity.merchantId, firstTransaction);
    const replay = await completeDemoOrder(connection.db, identity.merchantId, firstTransaction);
    const second = await completeDemoOrder(connection.db, identity.merchantId, secondTransaction);

    expect(first.orderNumber).toBe("NSS-0001");
    expect(replay).toEqual(first);
    expect(second.orderNumber).toBe("NSS-0002");
    const stored = await connection.db.select().from(orders);
    expect(stored).toHaveLength(2);
  });

  it("does not correlate another merchant's settlement", async () => {
    const first = await merchant("First Merchant");
    const second = await merchant("Second Merchant");
    const transactionId = await settledPayment(first.merchantId);

    await expect(
      completeDemoOrder(connection.db, second.merchantId, transactionId),
    ).rejects.toBeInstanceOf(DemoPaymentNotFoundError);
  });
});
