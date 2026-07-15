import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { hashApiKey } from "../../../../lib/auth/api-key";
import { createDatabase } from "../../../../lib/db/client";
import { provisionMerchant } from "../../../../lib/db/provision-merchant";
import { apiKeys, payments } from "../../../../lib/db/schema";
import { closeServerDatabase } from "../../../../lib/db/server";
import { GET } from "./route";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for payment route tests");

const connection = createDatabase(databaseUrl, 1);

async function merchant(label: string) {
  return provisionMerchant(connection.db, {
    email: `${label}-${randomUUID()}@example.test`,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x1111111111111111111111111111111111111111",
  });
}

async function secretKey(merchantId: string, env: "live" | "test" = "test") {
  const rawKey = `sk_${env}_${randomUUID().replaceAll("-", "")}`;
  const [key] = await connection.db
    .insert(apiKeys)
    .values({
      env,
      last4: rawKey.slice(-4),
      merchantId,
      name: "Route integration key",
      permissions: "read_only",
      prefix: `sk_${env}_`,
      secretHash: hashApiKey(rawKey),
      type: "secret",
    })
    .returning({ id: apiKeys.id });
  if (!key) throw new Error("Expected an API key row");
  return { id: key.id, rawKey };
}

async function payment(merchantId: string, env: "live" | "test") {
  await connection.db.insert(payments).values({
    amountUsd: "5.250000",
    currency: "USD",
    env,
    intentUrl: "https://merchant.example.test/intent",
    livemode: env === "live",
    merchantId,
    refCode: `TAB-${randomUUID().slice(0, 8).toUpperCase()}`,
    receiver: "0x1111111111111111111111111111111111111111",
    tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    tokenChainId: 42161,
  });
}

function request(rawKey?: string, env?: string) {
  const url = new URL("http://localhost/api/v1/payments");
  if (env) url.searchParams.set("env", env);
  return new NextRequest(url, {
    headers: rawKey ? { authorization: `Bearer ${rawKey}` } : {},
  });
}

describe("GET /api/v1/payments with real PostgreSQL", () => {
  beforeEach(async () => {
    await connection.client`truncate table users cascade`;
  });

  afterAll(async () => {
    await closeServerDatabase();
    await connection.client.end();
  });

  it("returns only rows authorized by the secret key and stamps LAST USED", async () => {
    const first = await merchant("list-first");
    const second = await merchant("list-second");
    const key = await secretKey(first.merchantId);
    await payment(first.merchantId, "test");
    await payment(first.merchantId, "live");
    await payment(second.merchantId, "test");

    const response = await GET(request(key.rawKey));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body.payments).toHaveLength(1);
    expect(body.payments[0]).toMatchObject({ amount: "5.250000", env: "test" });

    const [stored] = await connection.db
      .select({ lastUsedAt: apiKeys.lastUsedAt })
      .from(apiKeys)
      .where(eq(apiKeys.id, key.id));
    expect(stored?.lastUsedAt).toBeInstanceOf(Date);
  });

  it("rejects missing keys and cross-environment filters", async () => {
    const identity = await merchant("list-invalid");
    const key = await secretKey(identity.merchantId, "test");

    expect((await GET(request())).status).toBe(401);
    const denied = await GET(request(key.rawKey, "live"));
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({
      error: { code: "API_KEY_ENVIRONMENT_DENIED" },
    });
  });
});
