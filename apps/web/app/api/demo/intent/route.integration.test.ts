import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createSessionToken, SESSION_COOKIE_NAME } from "../../../../lib/auth/session";
import { createDatabase } from "../../../../lib/db/client";
import { provisionMerchant } from "../../../../lib/db/provision-merchant";
import { closeServerDatabase } from "../../../../lib/db/server";
import { verifyPaymentIntentToken } from "../../../../lib/payments/payment-intent-token";
import { GET } from "./route";

const databaseUrl = process.env.DATABASE_URL;
const sessionSecret = process.env.SESSION_SECRET;
if (!databaseUrl || !sessionSecret) throw new Error("Demo intent route test env is required");

const connection = createDatabase(databaseUrl, 1);
const signingSecret = "demo-intent-integration-secret-32-bytes";
const originalSigningSecret = process.env.PAYMENT_INTENT_SIGNING_SECRET;

async function merchant() {
  const email = `demo-intent-${randomUUID()}@example.test`;
  const identity = await provisionMerchant(connection.db, {
    email,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x2222222222222222222222222222222222222222",
  });
  const token = await createSessionToken({ ...identity, email, mode: "live" });
  return { ...identity, token };
}

function request(token?: string) {
  return new NextRequest("https://tab.example.test/api/demo/intent?amount=999", {
    ...(token ? { headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } } : {}),
    method: "GET",
  });
}

describe("GET /api/demo/intent with signed server authority", () => {
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

  it("mints a test intent from the signed merchant and ignores browser amount injection", async () => {
    const identity = await merchant();
    const response = await GET(request(identity.token));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.intent).toMatchObject({
      amount: "1.000000",
      mode: "test",
      receiver: "0x2222222222222222222222222222222222222222",
    });
    const verified = await verifyPaymentIntentToken(body.intentToken, { secret: signingSecret });
    expect(verified).toMatchObject({
      amountUsd: "1.000000",
      env: "test",
      merchantId: identity.merchantId,
    });
  });

  it("requires a valid dashboard session", async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("invalid"))).status).toBe(401);
  });
});
