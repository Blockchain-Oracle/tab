import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createSessionToken, SESSION_COOKIE_NAME } from "../../../../../../lib/auth/session";
import { createDatabase } from "../../../../../../lib/db/client";
import { provisionMerchant } from "../../../../../../lib/db/provision-merchant";
import { closeServerDatabase } from "../../../../../../lib/db/server";
import { POST } from "./route";

const databaseUrl = process.env.DATABASE_URL;
const sessionSecret = process.env.SESSION_SECRET;
const appOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost").origin;
if (!databaseUrl || !sessionSecret) throw new Error("Quickstart route test env is required");

const connection = createDatabase(databaseUrl, 1);

async function merchant() {
  const email = `quickstart-route-${randomUUID()}@example.test`;
  const identity = await provisionMerchant(connection.db, {
    email,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x1111111111111111111111111111111111111111",
  });
  const token = await createSessionToken({ ...identity, email, mode: "test" });
  return { ...identity, token };
}

function request(token?: string, origin = appOrigin) {
  return new NextRequest(`${appOrigin}/api/quickstart/steps/install/complete`, {
    headers: {
      ...(token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
      origin,
    },
    method: "POST",
  });
}

const context = (key: string) => ({ params: Promise.resolve({ key }) });

describe("POST Quickstart completion with a real merchant session", () => {
  beforeEach(async () => {
    await connection.client`truncate table users cascade`;
  });

  afterAll(async () => {
    await closeServerDatabase();
    await connection.client.end();
  });

  it("stores only manual progress for the signed tenant", async () => {
    const identity = await merchant();
    const response = await POST(request(identity.token), context("install"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ step: { key: "install" } });

    const derived = await POST(request(identity.token), context("create_api_key"));
    expect(derived.status).toBe(409);
    await expect(derived.json()).resolves.toMatchObject({
      error: { code: "QUICKSTART_STEP_NOT_MANUAL" },
    });
  });

  it("rejects missing sessions, cross-origin writes, and unknown keys", async () => {
    const identity = await merchant();
    expect((await POST(request(), context("install"))).status).toBe(401);
    expect(
      (await POST(request(identity.token, "https://attacker.example"), context("install"))).status,
    ).toBe(403);
    expect((await POST(request(identity.token), context("unknown"))).status).toBe(400);
  });
});
