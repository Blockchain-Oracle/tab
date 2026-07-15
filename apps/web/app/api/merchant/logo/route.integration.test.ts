import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createSessionToken, SESSION_COOKIE_NAME } from "../../../../lib/auth/session";
import { createDatabase } from "../../../../lib/db/client";
import { provisionMerchant } from "../../../../lib/db/provision-merchant";
import { merchants } from "../../../../lib/db/schema";
import { closeServerDatabase } from "../../../../lib/db/server";
import { POST, PUT } from "./route";

const databaseUrl = process.env.DATABASE_URL;
const appOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost").origin;
const originalBlobToken = process.env.BLOB_READ_WRITE_TOKEN;

if (!databaseUrl || !process.env.SESSION_SECRET) {
  throw new Error("DATABASE_URL and SESSION_SECRET are required for logo integration tests");
}

const connection = createDatabase(databaseUrl, 1);

function request(method: "POST" | "PUT", body: unknown, token?: string, origin = appOrigin) {
  return new NextRequest(`${appOrigin}/api/merchant/logo`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...(token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
      origin,
    },
    method,
  });
}

async function merchantSession() {
  const email = `logo-${randomUUID()}@example.test`;
  const identity = await provisionMerchant(connection.db, {
    email,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x4444444444444444444444444444444444444444",
  });
  const token = await createSessionToken({ ...identity, email, mode: "test" });
  return { ...identity, token };
}

function tokenRequest(merchantId: string) {
  return {
    payload: {
      clientPayload: null,
      multipart: false,
      pathname: `merchant-logos/${merchantId}/logo`,
    },
    type: "blob.generate-client-token",
  };
}

describe("merchant logo route without configured storage", () => {
  beforeEach(async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    await connection.client`
      truncate table quickstart_progress, api_keys, merchants, users cascade
    `;
  });

  afterAll(async () => {
    if (originalBlobToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = originalBlobToken;
    await closeServerDatabase();
    await connection.client.end();
  });

  it("rejects hostile origins and missing sessions before disclosing storage state", async () => {
    const identity = await merchantSession();
    const body = tokenRequest(identity.merchantId);

    const hostile = await POST(request("POST", body, identity.token, "https://attacker.example"));
    const missing = await POST(request("POST", body));
    const invalid = await POST(request("POST", body, "not-a-jwt"));

    expect(hostile.status).toBe(403);
    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
  });

  it("rejects structurally invalid upload events without throwing", async () => {
    const nullBody = await POST(request("POST", null));
    const missingPayload = await POST(request("POST", { type: "blob.generate-client-token" }));

    expect(nullBody.status).toBe(400);
    expect(missingPayload.status).toBe(400);
  });

  it("returns an honest unavailable state to an authenticated tenant", async () => {
    const identity = await merchantSession();
    const response = await POST(request("POST", tokenRequest(identity.merchantId), identity.token));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "LOGO_STORAGE_NOT_CONFIGURED" },
    });

    const [merchant] = await connection.db
      .select({ logoUrl: merchants.logoUrl })
      .from(merchants)
      .where(eq(merchants.id, identity.merchantId));
    expect(merchant?.logoUrl).toBeNull();
  });

  it("protects logo finalization before checking the external store", async () => {
    const identity = await merchantSession();
    const body = { url: "https://example.invalid/logo.png" };

    const hostile = await PUT(request("PUT", body, identity.token, "https://attacker.example"));
    const missing = await PUT(request("PUT", body));
    const configuredAway = await PUT(request("PUT", body, identity.token));

    expect(hostile.status).toBe(403);
    expect(missing.status).toBe(401);
    expect(configuredAway.status).toBe(503);
  });
});
