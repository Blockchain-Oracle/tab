import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { hashApiKey } from "../../../../lib/auth/api-key";
import { createDatabase } from "../../../../lib/db/client";
import { provisionMerchant } from "../../../../lib/db/provision-merchant";
import { apiKeys } from "../../../../lib/db/schema";
import { closeServerDatabase } from "../../../../lib/db/server";
import { verifyPaymentIntentToken } from "../../../../lib/payments/payment-intent-token";
import { POST } from "./route";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for payment-intent route tests");

const connection = createDatabase(databaseUrl, 1);
const signingSecret = "integration-payment-intent-route-secret-32-bytes";
const originalSigningSecret = process.env.PAYMENT_INTENT_SIGNING_SECRET;

async function secretKey(
  merchantId: string,
  options: { env?: "live" | "test"; permissions?: "full" | "read_only" } = {},
) {
  const env = options.env ?? "test";
  const rawKey = `sk_${env}_${randomUUID().replaceAll("-", "")}`;
  const [key] = await connection.db
    .insert(apiKeys)
    .values({
      env,
      last4: rawKey.slice(-4),
      merchantId,
      name: "Payment intent integration key",
      permissions: options.permissions ?? "full",
      prefix: `sk_${env}_`,
      secretHash: hashApiKey(rawKey),
      type: "secret",
    })
    .returning({ id: apiKeys.id });
  if (!key) throw new Error("Expected a secret API key row");
  return { id: key.id, rawKey };
}

function request(rawKey: string, body: unknown) {
  return new NextRequest("http://localhost/api/v1/payment-intents", {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${rawKey}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
}

describe("POST /api/v1/payment-intents with real PostgreSQL and JWS", () => {
  beforeEach(async () => {
    process.env.PAYMENT_INTENT_SIGNING_SECRET = signingSecret;
    await connection.client`truncate table users cascade`;
  });

  afterAll(async () => {
    if (originalSigningSecret === undefined) delete process.env.PAYMENT_INTENT_SIGNING_SECRET;
    else process.env.PAYMENT_INTENT_SIGNING_SECRET = originalSigningSecret;
    await closeServerDatabase();
    await connection.client.end();
  });

  it("mints a short-lived intent from DB authority and stamps the full-access key", async () => {
    const identity = await provisionMerchant(connection.db, {
      email: `intent-${randomUUID()}@example.test`,
      magicIssuer: `did:ethr:${randomUUID()}`,
      receivingAddress: "0x2222222222222222222222222222222222222222",
    });
    const key = await secretKey(identity.merchantId, { env: "live" });

    const response = await POST(
      request(key.rawKey, {
        amount: "5.250000",
        intentUrl: "https://merchant.example.test/api/payment-intent",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toMatchObject({
      intent: {
        amount: "5.250000",
        currency: "USD",
        receiver: "0x2222222222222222222222222222222222222222",
        token: {
          address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
          chainId: 42161,
        },
      },
      intentToken: expect.any(String),
    });

    const verified = await verifyPaymentIntentToken(body.intentToken, { secret: signingSecret });
    expect(verified).toMatchObject({
      amountUsd: "5.250000",
      env: "live",
      intentUrl: "https://merchant.example.test/api/payment-intent",
      merchantId: identity.merchantId,
      receiver: "0x2222222222222222222222222222222222222222",
    });
    expect(verified.expiresAt.getTime() - Date.now()).toBeGreaterThan(4 * 60 * 1_000);
    expect(verified.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(5 * 60 * 1_000);

    const [stored] = await connection.db
      .select({ lastUsedAt: apiKeys.lastUsedAt })
      .from(apiKeys)
      .where(eq(apiKeys.id, key.id));
    expect(stored?.lastUsedAt).toBeInstanceOf(Date);
  });

  it("denies read-only keys and rejects caller-supplied authority fields", async () => {
    const identity = await provisionMerchant(connection.db, {
      email: `intent-denied-${randomUUID()}@example.test`,
      magicIssuer: `did:ethr:${randomUUID()}`,
      receivingAddress: "0x3333333333333333333333333333333333333333",
    });
    const readOnly = await secretKey(identity.merchantId, { permissions: "read_only" });
    const full = await secretKey(identity.merchantId);

    expect(
      (await POST(request(readOnly.rawKey, { amount: "5.25", intentUrl: "https://x.test/i" })))
        .status,
    ).toBe(403);
    const injected = await POST(
      request(full.rawKey, {
        amount: "5.25",
        intentUrl: "https://x.test/i",
        receiver: "0x4444444444444444444444444444444444444444",
      }),
    );
    expect(injected.status).toBe(400);
    await expect(injected.json()).resolves.toMatchObject({
      error: { code: "INVALID_PAYMENT_INTENT_REQUEST" },
    });
  });

  it("fails closed for unsafe URLs and missing signing configuration", async () => {
    const identity = await provisionMerchant(connection.db, {
      email: `intent-config-${randomUUID()}@example.test`,
      magicIssuer: `did:ethr:${randomUUID()}`,
      receivingAddress: "0x5555555555555555555555555555555555555555",
    });
    const key = await secretKey(identity.merchantId);

    expect(
      (await POST(request(key.rawKey, { amount: "1.00", intentUrl: "http://x.test/i" }))).status,
    ).toBe(400);

    delete process.env.PAYMENT_INTENT_SIGNING_SECRET;
    const response = await POST(
      request(key.rawKey, { amount: "1.00", intentUrl: "https://x.test/i" }),
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PAYMENT_INTENT_SIGNING_UNAVAILABLE" },
    });
  });
});
