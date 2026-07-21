import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createSessionToken, SESSION_COOKIE_NAME } from "../../../../lib/auth/session";
import { createDatabase } from "../../../../lib/db/client";
import { merchants, users } from "../../../../lib/db/schema";
import { closeServerDatabase } from "../../../../lib/db/server";
import { POST } from "./route";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for PostgreSQL integration tests");
}

const connection = createDatabase(databaseUrl, 1);

function request(cookie?: string, origin = "http://localhost") {
  return new Request("http://localhost/api/workspace/switch", {
    headers: {
      origin,
      ...(cookie ? { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } : {}),
    },
    method: "POST",
  }) as never;
}

async function seedUser(withMerchant: boolean) {
  const [user] = await connection.db
    .insert(users)
    .values({ email: "dual@example.com", magicIssuer: `did:ethr:${crypto.randomUUID()}` })
    .returning({ email: users.email, id: users.id });
  if (!user) throw new Error("seed user failed");

  let merchantId: string | undefined;
  if (withMerchant) {
    const [merchant] = await connection.db
      .insert(merchants)
      .values({
        businessName: "Dual Co",
        receivingAddress: "0x00000000000000000000000000000000000000aa",
        userId: user.id,
      })
      .returning({ id: merchants.id });
    merchantId = merchant?.id;
  }
  return { ...user, merchantId };
}

describe("POST /api/workspace/switch", () => {
  beforeEach(async () => {
    await connection.client`
      truncate table quickstart_progress, api_keys, merchants, users cascade
    `;
  });

  afterAll(async () => {
    await closeServerDatabase();
    await connection.client.end();
  });

  it("requires a session", async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
  });

  it("re-scopes a merchant session to agent owner without re-authentication", async () => {
    const seeded = await seedUser(true);
    const token = await createSessionToken({
      email: seeded.email,
      merchantId: seeded.merchantId as string,
      mode: "test",
      userId: seeded.id,
    });

    const response = await POST(request(token));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ redirectTo: "/agents" });
    expect(response.headers.get("set-cookie")).toContain(SESSION_COOKIE_NAME);
  });

  it("re-scopes an owner session to the user's merchant workspace on Testnet", async () => {
    const seeded = await seedUser(true);
    const token = await createSessionToken({ email: seeded.email, userId: seeded.id });

    const response = await POST(request(token));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ redirectTo: "/dashboard" });
    expect(response.headers.get("set-cookie")).toContain(SESSION_COOKIE_NAME);
  });

  it("refuses owner→merchant when no merchant workspace exists", async () => {
    const seeded = await seedUser(false);
    const token = await createSessionToken({ email: seeded.email, userId: seeded.id });

    const response = await POST(request(token));

    expect(response.status).toBe(409);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
