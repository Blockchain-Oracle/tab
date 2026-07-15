import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { hashApiKey } from "../../../../../lib/auth/api-key";
import { createDatabase } from "../../../../../lib/db/client";
import { provisionMerchant } from "../../../../../lib/db/provision-merchant";
import { apiKeys, payments, settlements } from "../../../../../lib/db/schema";
import { closeServerDatabase } from "../../../../../lib/db/server";
import { GET, OPTIONS, PATCH } from "./route";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for payment detail tests");

const connection = createDatabase(databaseUrl, 1);
const originalMagicSecret = process.env.MAGIC_SECRET_KEY;

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

function reportRequest(rawKey: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/v1/payments/detail", {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${rawKey}`,
      "content-type": "application/json",
      origin: "https://merchant.example.test",
      ...headers,
    },
    method: "PATCH",
  });
}

function reportBody(overrides: Record<string, unknown> = {}) {
  return {
    buyerDidToken: "buyer.magic.did.token",
    tokenChanges: [{ amount: "7.000000" }],
    transactionId: `test_${randomUUID()}`,
    ...overrides,
  };
}

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET and PATCH /api/v1/payments/:id with real PostgreSQL", () => {
  beforeEach(async () => {
    delete process.env.MAGIC_SECRET_KEY;
    await connection.client`truncate table users cascade`;
  });

  afterAll(async () => {
    if (originalMagicSecret === undefined) delete process.env.MAGIC_SECRET_KEY;
    else process.env.MAGIC_SECRET_KEY = originalMagicSecret;
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

  it("returns an honest configuration error without mutating a valid report", async () => {
    const identity = await merchant("report-config");
    const paymentId = await payment(identity.merchantId);

    const response = await PATCH(
      reportRequest(identity.publishableKeys.test, reportBody()),
      context(paymentId),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "MAGIC_NOT_CONFIGURED" },
    });
    const [stored] = await connection.db.select().from(payments).where(eq(payments.id, paymentId));
    expect(stored).toMatchObject({
      payerAddress: null,
      reportedAt: null,
      reportedTokenChanges: null,
      reportedTransactionId: null,
      status: "pending",
    });
    expect(await connection.db.select().from(settlements)).toHaveLength(0);
  });

  it("rejects malformed, oversized, and cross-scope reports before Magic", async () => {
    const first = await merchant("report-first");
    const second = await merchant("report-second");
    const ownPaymentId = await payment(first.merchantId);
    const foreignPaymentId = await payment(second.merchantId);

    const malformed = await PATCH(
      reportRequest(first.publishableKeys.test, reportBody({ receiver: "caller-authority" })),
      context(ownPaymentId),
    );
    expect(malformed.status).toBe(400);

    const controlCharacter = await PATCH(
      reportRequest(first.publishableKeys.test, reportBody({ transactionId: "candidate\u0000id" })),
      context(ownPaymentId),
    );
    expect(controlCharacter.status).toBe(400);

    const oversized = await PATCH(
      reportRequest(first.publishableKeys.test, reportBody(), { "content-length": "120001" }),
      context(ownPaymentId),
    );
    expect(oversized.status).toBe(413);

    const foreign = await PATCH(
      reportRequest(first.publishableKeys.test, reportBody()),
      context(foreignPaymentId),
    );
    expect(foreign.status).toBe(404);
    expect(await connection.db.select().from(settlements)).toHaveLength(0);
  });

  it("returns CORS headers for unauthenticated reports and browser preflight", async () => {
    const unauthenticated = await PATCH(
      reportRequest("pk_test_missing", reportBody()),
      context(randomUUID()),
    );
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get("access-control-allow-origin")).toBe("*");

    const preflight = OPTIONS();
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
    expect(preflight.headers.get("access-control-allow-credentials")).toBeNull();
    expect(preflight.headers.get("access-control-allow-methods")).toContain("PATCH");
  });
});
