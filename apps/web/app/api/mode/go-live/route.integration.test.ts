import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createSessionToken, SESSION_COOKIE_NAME } from "../../../../lib/auth/session";
import { createDatabase } from "../../../../lib/db/client";
import { provisionMerchant } from "../../../../lib/db/provision-merchant";
import { closeServerDatabase } from "../../../../lib/db/server";
import { GET, POST } from "./route";

const databaseUrl = process.env.DATABASE_URL;
const sessionSecret = process.env.SESSION_SECRET;
const appOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost").origin;
if (!databaseUrl || !sessionSecret) throw new Error("Go Live route test env is required");

const connection = createDatabase(databaseUrl, 1);

async function merchant() {
  const email = `go-live-route-${randomUUID()}@example.test`;
  const identity = await provisionMerchant(connection.db, {
    email,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x1111111111111111111111111111111111111111",
  });
  const token = await createSessionToken({ ...identity, email, mode: "test" });
  return { ...identity, token };
}

function request(method: "GET" | "POST", token?: string, body?: unknown, origin = appOrigin) {
  return new NextRequest(`${appOrigin}/api/mode/go-live`, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
      origin,
    },
    method,
  });
}

describe("Go Live API with real PostgreSQL", () => {
  beforeEach(async () => {
    await connection.client`truncate table users cascade`;
  });

  afterAll(async () => {
    await closeServerDatabase();
    await connection.client.end();
  });

  it("returns real readiness and requires an explicit incomplete-checklist acknowledgement", async () => {
    const identity = await merchant();
    const readiness = await GET(request("GET", identity.token));
    expect(readiness.status).toBe(200);
    await expect(readiness.json()).resolves.toMatchObject({ readiness: { ready: false } });

    const blocked = await POST(request("POST", identity.token, { acknowledgeIncomplete: false }));
    expect(blocked.status).toBe(409);

    const activated = await POST(request("POST", identity.token, { acknowledgeIncomplete: true }));
    expect(activated.status).toBe(200);
    await expect(activated.json()).resolves.toMatchObject({ activated: true });
  });

  it("rejects unauthenticated and cross-origin activation", async () => {
    const identity = await merchant();
    expect((await GET(request("GET"))).status).toBe(401);
    expect(
      (
        await POST(
          request(
            "POST",
            identity.token,
            { acknowledgeIncomplete: true },
            "https://attacker.example",
          ),
        )
      ).status,
    ).toBe(403);
  });
});
