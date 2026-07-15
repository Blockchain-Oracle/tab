import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../../../../lib/db/client";
import { provisionMerchant } from "../../../../lib/db/provision-merchant";
import { merchants, payments } from "../../../../lib/db/schema";
import { closeServerDatabase } from "../../../../lib/db/server";
import { signPaymentIntentToken } from "../../../../lib/payments/payment-intent-token";
import { OPTIONS, POST } from "./route";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for create-payment route tests");

const connection = createDatabase(databaseUrl, 4);
const signingSecret = "integration-create-payment-secret-at-least-32-bytes";
const originalSigningSecret = process.env.PAYMENT_INTENT_SIGNING_SECRET;
async function merchant(label: string, receiver: string) {
  return provisionMerchant(connection.db, {
    email: `${label}-${randomUUID()}@example.test`,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: receiver,
  });
}

function request(
  publishableKey: string,
  body: unknown,
  additionalHeaders: Record<string, string> = {},
) {
  return new NextRequest("http://localhost/api/v1/payments", {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${publishableKey}`,
      "content-type": "application/json",
      origin: "https://merchant.example.test",
      ...additionalHeaders,
    },
    method: "POST",
  });
}

function token(input: { env: "live" | "test"; merchantId: string; now?: Date; receiver: string }) {
  return signPaymentIntentToken(
    {
      amountUsd: "5.250000",
      env: input.env,
      intentUrl: "https://merchant.example.test/api/payment-intent",
      jti: randomUUID(),
      merchantId: input.merchantId,
      receiver: input.receiver,
    },
    { secret: signingSecret, ...(input.now ? { now: input.now } : {}) },
  );
}

describe("POST /api/v1/payments create-at-open with real PostgreSQL", () => {
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

  it("creates a pending row exclusively from signed and database authority", async () => {
    const receiver = "0x1111111111111111111111111111111111111111";
    const identity = await merchant("create", receiver);
    const intentToken = await token({
      env: "test",
      merchantId: identity.merchantId,
      receiver,
    });

    const response = await POST(request(identity.publishableKeys.test, { intentToken }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toMatchObject({
      payment: {
        amount: "5.250000",
        currency: "USD",
        env: "test",
        livemode: false,
        receiver,
        status: "pending",
        token: {
          address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
          chainId: 42161,
        },
      },
      paymentId: expect.any(String),
      refCode: expect.stringMatching(/^TAB-[0-9A-HJKMNP-TV-Z]{8}$/),
    });

    const [stored] = await connection.db.select().from(payments);
    expect(stored).toMatchObject({
      amountUsd: "5.250000",
      env: "test",
      id: body.paymentId,
      intentUrl: "https://merchant.example.test/api/payment-intent",
      livemode: false,
      merchantId: identity.merchantId,
      receiver,
      refCode: body.refCode,
      status: "pending",
    });
    expect(stored?.reportedTransactionId).toBeNull();
    expect(stored?.settledAt).toBeNull();
  });

  it("makes concurrent and sequential replay return the one canonical payment", async () => {
    const receiver = "0x2222222222222222222222222222222222222222";
    const identity = await merchant("replay", receiver);
    const intentToken = await token({
      env: "live",
      merchantId: identity.merchantId,
      receiver,
    });

    const responses = await Promise.all([
      POST(request(identity.publishableKeys.live, { intentToken })),
      POST(request(identity.publishableKeys.live, { intentToken })),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 201]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(bodies[0]).toMatchObject({ paymentId: bodies[1].paymentId, refCode: bodies[1].refCode });

    const replay = await POST(request(identity.publishableKeys.live, { intentToken }));
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({
      paymentId: bodies[0].paymentId,
      refCode: bodies[0].refCode,
    });
    expect(await connection.db.select().from(payments)).toHaveLength(1);
  });

  it("rejects tampered, expired, cross-tenant, and cross-environment tokens without rows", async () => {
    const receiver = "0x3333333333333333333333333333333333333333";
    const first = await merchant("reject-first", receiver);
    const second = await merchant("reject-second", receiver);
    const valid = await token({ env: "test", merchantId: first.merchantId, receiver });
    const segments = valid.split(".");
    const tampered = `${segments[0]}.${segments[1]?.slice(0, -1)}A.${segments[2]}`;
    const expired = await token({
      env: "test",
      merchantId: first.merchantId,
      now: new Date(Date.now() - 6 * 60 * 1_000),
      receiver,
    });

    const attempts = [
      POST(request(first.publishableKeys.test, { intentToken: tampered })),
      POST(request(first.publishableKeys.test, { intentToken: expired })),
      POST(request(second.publishableKeys.test, { intentToken: valid })),
      POST(request(first.publishableKeys.live, { intentToken: valid })),
    ];
    for (const response of await Promise.all(attempts)) {
      expect(response.status).toBe(400);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
    }
    expect(await connection.db.select().from(payments)).toHaveLength(0);
  });

  it("rejects stale receivers and any extra browser authority fields", async () => {
    const receiver = "0x4444444444444444444444444444444444444444";
    const identity = await merchant("stale", receiver);
    const intentToken = await token({
      env: "test",
      merchantId: identity.merchantId,
      receiver,
    });
    await connection.db
      .update(merchants)
      .set({ receivingAddress: "0x5555555555555555555555555555555555555555" })
      .where(eq(merchants.id, identity.merchantId));

    const stale = await POST(request(identity.publishableKeys.test, { intentToken }));
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      error: { code: "PAYMENT_INTENT_STALE" },
    });

    const injected = await POST(request(identity.publishableKeys.test, { intentToken, receiver }));
    expect(injected.status).toBe(400);
    expect(await connection.db.select().from(payments)).toHaveLength(0);
  });

  it("answers browser preflight without credentials", async () => {
    const response = await OPTIONS();

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("rejects oversized bodies and preserves CORS on authentication errors", async () => {
    const receiver = "0x6666666666666666666666666666666666666666";
    const identity = await merchant("create-limits", receiver);

    const oversized = await POST(
      request(
        identity.publishableKeys.test,
        { intentToken: "not-read" },
        { "content-length": "10001" },
      ),
    );
    expect(oversized.status).toBe(413);
    expect(oversized.headers.get("access-control-allow-origin")).toBe("*");

    const unauthenticated = await POST(request("pk_test_missing", { intentToken: "not-read" }));
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get("access-control-allow-origin")).toBe("*");
    expect(await connection.db.select().from(payments)).toHaveLength(0);
  });
});
