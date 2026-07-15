import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createSessionToken,
  readSessionToken,
  SESSION_COOKIE_NAME,
} from "../../../lib/auth/session";
import { createDatabase } from "../../../lib/db/client";
import { provisionMerchant } from "../../../lib/db/provision-merchant";
import { merchants } from "../../../lib/db/schema";
import { POST } from "./route";

const databaseUrl = process.env.DATABASE_URL;
const sessionSecret = process.env.SESSION_SECRET;
const appOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost").origin;

if (!databaseUrl || !sessionSecret) {
  throw new Error("DATABASE_URL and SESSION_SECRET are required for mode integration tests");
}

const connection = createDatabase(databaseUrl, 1);

function request(mode: string, token?: string, origin = appOrigin) {
  return new NextRequest(`${appOrigin}/api/mode`, {
    body: JSON.stringify({ mode }),
    headers: {
      "content-type": "application/json",
      ...(token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
      origin,
    },
    method: "POST",
  });
}

async function merchantSession(email: string, mode: "test" | "live" = "test") {
  const identity = await provisionMerchant(connection.db, {
    email,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x1111111111111111111111111111111111111111",
  });
  const token = await createSessionToken({ ...identity, email, mode });
  return { ...identity, token };
}

describe("POST /api/mode with real PostgreSQL", () => {
  beforeEach(async () => {
    await connection.client`
      truncate table quickstart_progress, api_keys, merchants, users cascade
    `;
  });

  afterAll(async () => {
    await connection.client.end();
  });

  it("rejects missing sessions and cross-origin mutations", async () => {
    const missing = await POST(request("test"));
    const identity = await merchantSession("origin@example.test");
    const hostile = await POST(request("test", identity.token, "https://attacker.example"));

    expect(missing.status).toBe(401);
    expect(missing.headers.get("set-cookie")).toBeNull();
    expect(hostile.status).toBe(403);
    expect(hostile.headers.get("set-cookie")).toBeNull();
  });

  it("rejects an unknown mode without reissuing the session", async () => {
    const identity = await merchantSession("invalid-mode@example.test");
    const response = await POST(request("preview", identity.token));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_MODE" },
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not imply Live activation before the real Go Live flow", async () => {
    const identity = await merchantSession("test-only@example.test");
    const response = await POST(request("live", identity.token));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "LIVE_NOT_ACTIVATED" },
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("reissues verifiable sessions when an activated merchant changes environments", async () => {
    const identity = await merchantSession("activated@example.test");
    await connection.db
      .update(merchants)
      .set({ liveActivatedAt: new Date() })
      .where(eq(merchants.id, identity.merchantId));

    const liveResponse = await POST(request("live", identity.token));
    const liveToken = liveResponse.cookies.get(SESSION_COOKIE_NAME)?.value;

    expect(liveResponse.status).toBe(200);
    await expect(liveResponse.json()).resolves.toEqual({ mode: "live" });
    expect(liveToken).toBeTruthy();
    await expect(readSessionToken(liveToken ?? "")).resolves.toMatchObject({
      merchantId: identity.merchantId,
      mode: "live",
      userId: identity.userId,
    });

    const testResponse = await POST(request("test", liveToken));
    const testToken = testResponse.cookies.get(SESSION_COOKIE_NAME)?.value;

    expect(testResponse.status).toBe(200);
    await expect(testResponse.json()).resolves.toEqual({ mode: "test" });
    expect(testToken).toBeTruthy();
    await expect(readSessionToken(testToken ?? "")).resolves.toMatchObject({
      merchantId: identity.merchantId,
      mode: "test",
      userId: identity.userId,
    });
  });
});
