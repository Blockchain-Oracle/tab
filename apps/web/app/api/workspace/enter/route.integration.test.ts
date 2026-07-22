import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createSessionToken, SESSION_COOKIE_NAME } from "../../../../lib/auth/session";
import { createDatabase } from "../../../../lib/db/client";
import { merchants, users } from "../../../../lib/db/schema";
import { closeServerDatabase } from "../../../../lib/db/server";
import { GET } from "./route";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for PostgreSQL integration tests");
}

const connection = createDatabase(databaseUrl, 1);

function request(scope: string, cookie?: string) {
  return new Request(`http://localhost/api/workspace/enter?scope=${scope}`, {
    headers: cookie ? { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } : {},
    method: "GET",
  }) as never;
}

function location(response: Response) {
  return new URL(response.headers.get("location") ?? "").pathname;
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

describe("GET /api/workspace/enter", () => {
  beforeEach(async () => {
    await connection.client`
      truncate table quickstart_progress, api_keys, merchants, users cascade
    `;
  });

  afterAll(async () => {
    await closeServerDatabase();
    await connection.client.end();
  });

  it("sends visitors without a session to the surface's login page", async () => {
    const merchant = await GET(request("merchant"));
    expect(location(merchant)).toBe("/login");
    const owner = await GET(request("owner"));
    expect(location(owner)).toBe("/agents/login");
  });

  it("re-scopes an owner token into the merchant dashboard without re-authentication", async () => {
    const seeded = await seedUser(true);
    const token = await createSessionToken({ email: seeded.email, userId: seeded.id });

    const response = await GET(request("merchant", token));

    expect(location(response)).toBe("/dashboard");
    expect(response.headers.get("set-cookie")).toContain(SESSION_COOKIE_NAME);
  });

  it("re-scopes a merchant token into the agents surface without re-authentication", async () => {
    const seeded = await seedUser(true);
    const token = await createSessionToken({
      email: seeded.email,
      merchantId: seeded.merchantId as string,
      mode: "test",
      userId: seeded.id,
    });

    const response = await GET(request("owner", token));

    expect(location(response)).toBe("/agents");
    expect(response.headers.get("set-cookie")).toContain(SESSION_COOKIE_NAME);
  });

  it("passes through a token that already has the requested scope untouched", async () => {
    const seeded = await seedUser(true);
    const token = await createSessionToken({
      email: seeded.email,
      merchantId: seeded.merchantId as string,
      mode: "test",
      userId: seeded.id,
    });

    const response = await GET(request("merchant", token));

    expect(location(response)).toBe("/dashboard");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("sends an owner without a merchant workspace to the merchant login, not a loop", async () => {
    const seeded = await seedUser(false);
    const token = await createSessionToken({ email: seeded.email, userId: seeded.id });

    const response = await GET(request("merchant", token));

    expect(location(response)).toBe("/login");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
