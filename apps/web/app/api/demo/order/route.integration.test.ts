import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createSessionToken, SESSION_COOKIE_NAME } from "../../../../lib/auth/session";
import { createDatabase } from "../../../../lib/db/client";
import { provisionMerchant } from "../../../../lib/db/provision-merchant";
import { merchants, payments, settlements } from "../../../../lib/db/schema";
import { closeServerDatabase } from "../../../../lib/db/server";
import { fakeTxHash } from "../../../../lib/payments/verify-test-support";
import { POST } from "./route";

const databaseUrl = process.env.DATABASE_URL;
const sessionSecret = process.env.SESSION_SECRET;
const appOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost").origin;
if (!databaseUrl || !sessionSecret) throw new Error("Demo order route test env is required");
const connection = createDatabase(databaseUrl, 1);

async function merchant() {
  const email = `demo-order-route-${randomUUID()}@example.test`;
  const identity = await provisionMerchant(connection.db, {
    email,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x1111111111111111111111111111111111111111",
  });
  await connection.db
    .update(merchants)
    .set({ businessName: "Coastal Paper Goods" })
    .where(eq(merchants.id, identity.merchantId));
  const token = await createSessionToken({ ...identity, email, mode: "test" });
  return { ...identity, token };
}

async function settlement(merchantId: string) {
  const transactionId = fakeTxHash();
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

function request(body: unknown, token?: string, origin = appOrigin) {
  return new NextRequest(`${appOrigin}/api/demo/order`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...(token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
      origin,
    },
    method: "POST",
  });
}

describe("POST /api/demo/order with real settlement evidence", () => {
  beforeEach(async () => {
    await connection.client`truncate table users cascade`;
  });

  afterAll(async () => {
    await closeServerDatabase();
    await connection.client.end();
  });

  it("creates the signed tenant's runtime-prefixed order", async () => {
    const identity = await merchant();
    const transactionId = await settlement(identity.merchantId);
    const response = await POST(request({ transactionId }, identity.token));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ order: { orderNumber: "CPG-0001" } });
  });

  it("rejects missing sessions, cross-origin requests, and unsupported fields", async () => {
    const identity = await merchant();
    const transactionId = await settlement(identity.merchantId);
    expect((await POST(request({ transactionId }))).status).toBe(401);
    expect(
      (await POST(request({ transactionId }, identity.token, "https://attacker.example"))).status,
    ).toBe(403);
    expect((await POST(request({ amount: "99", transactionId }, identity.token))).status).toBe(400);
  });
});
