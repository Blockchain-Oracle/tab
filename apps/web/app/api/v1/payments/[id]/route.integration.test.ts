import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { hashApiKey } from "../../../../../lib/auth/api-key";
import { createDatabase } from "../../../../../lib/db/client";
import { provisionMerchant } from "../../../../../lib/db/provision-merchant";
import { apiKeys, payments } from "../../../../../lib/db/schema";
import { closeServerDatabase } from "../../../../../lib/db/server";
import { GET } from "./route";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for payment detail tests");

const connection = createDatabase(databaseUrl, 1);

async function merchant(label: string) {
  return provisionMerchant(connection.db, {
    email: `${label}-${randomUUID()}@example.test`,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x1111111111111111111111111111111111111111",
  });
}

async function secretKey(merchantId: string) {
  const rawKey = `sk_test_${randomUUID().replaceAll("-", "")}`;
  await connection.db.insert(apiKeys).values({
    env: "test",
    last4: rawKey.slice(-4),
    merchantId,
    name: "Detail integration key",
    permissions: "read_only",
    prefix: "sk_test_",
    secretHash: hashApiKey(rawKey),
    type: "secret",
  });
  return rawKey;
}

async function payment(merchantId: string, env: "live" | "test" = "test") {
  const [row] = await connection.db
    .insert(payments)
    .values({
      amountUsd: "7.000000",
      currency: "USD",
      env,
      intentUrl: "https://merchant.example.test/intent",
      livemode: env === "live",
      merchantId,
      refCode: `TAB-${randomUUID().slice(0, 8).toUpperCase()}`,
      receiver: "0x1111111111111111111111111111111111111111",
      tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      tokenChainId: 42161,
    })
    .returning({ id: payments.id });
  if (!row) throw new Error("Expected a payment row");
  return row.id;
}

function request(rawKey?: string) {
  return new NextRequest("http://localhost/api/v1/payments/detail", {
    headers: rawKey ? { authorization: `Bearer ${rawKey}` } : {},
  });
}

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/v1/payments/:id with real PostgreSQL", () => {
  beforeEach(async () => {
    await connection.client`truncate table users cascade`;
  });

  afterAll(async () => {
    await closeServerDatabase();
    await connection.client.end();
  });

  it("returns the authenticated merchant's payment", async () => {
    const identity = await merchant("detail-owner");
    const rawKey = await secretKey(identity.merchantId);
    const paymentId = await payment(identity.merchantId);

    const response = await GET(request(rawKey), context(paymentId));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      payment: { amount: "7.000000", env: "test", id: paymentId },
    });
  });

  it("uses 404 for cross-tenant and cross-environment records", async () => {
    const first = await merchant("detail-first");
    const second = await merchant("detail-second");
    const rawKey = await secretKey(first.merchantId);

    expect((await GET(request(rawKey), context(await payment(second.merchantId)))).status).toBe(
      404,
    );
    expect(
      (await GET(request(rawKey), context(await payment(first.merchantId, "live")))).status,
    ).toBe(404);
  });

  it("rejects missing keys and malformed identifiers", async () => {
    const identity = await merchant("detail-invalid");
    const rawKey = await secretKey(identity.merchantId);

    expect((await GET(request(), context(randomUUID()))).status).toBe(401);
    const malformed = await GET(request(rawKey), context("not-a-uuid"));
    expect(malformed.status).toBe(400);
  });
});
