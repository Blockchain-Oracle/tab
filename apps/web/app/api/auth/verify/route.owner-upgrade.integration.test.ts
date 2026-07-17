import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const magicBoundary = vi.hoisted(() => ({ verifyMerchantDidToken: vi.fn() }));

vi.mock("../../../../lib/auth/magic-admin", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../../lib/auth/magic-admin")>();
  return {
    ...original,
    verifyMerchantDidToken: magicBoundary.verifyMerchantDidToken,
  };
});

import { readSessionToken, SESSION_COOKIE_NAME } from "../../../../lib/auth/session";
import { createDatabase } from "../../../../lib/db/client";
import { closeServerDatabase } from "../../../../lib/db/server";
import { POST } from "./route";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const sessionSecret = "x".repeat(64);
const originalMagicSecret = process.env.MAGIC_SECRET_KEY;
const originalSessionSecret = process.env.SESSION_SECRET;
const connection = createDatabase(databaseUrl, 1);

function request(body: unknown) {
  return new Request("http://localhost/api/auth/verify", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", origin: "http://localhost" },
    method: "POST",
  });
}

function cookieToken(response: Response) {
  const header = response.headers.get("set-cookie");
  if (!header) throw new Error("Expected a session cookie");
  const [cookie = ""] = header.split(";", 1);
  const [name, token] = cookie.split("=", 2);
  expect(name).toBe(SESSION_COOKIE_NAME);
  if (!token) throw new Error("Expected a session token");
  return token;
}

describe("merchant signup after Leash owner auth", () => {
  beforeEach(async () => {
    process.env.MAGIC_SECRET_KEY = "configured-magic-boundary";
    process.env.SESSION_SECRET = sessionSecret;
    magicBoundary.verifyMerchantDidToken.mockReset();
    await connection.client`truncate table users cascade`;
  });

  afterEach(() => {
    if (originalMagicSecret === undefined) delete process.env.MAGIC_SECRET_KEY;
    else process.env.MAGIC_SECRET_KEY = originalMagicSecret;
    if (originalSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSessionSecret;
  });

  afterAll(async () => {
    await connection.client`truncate table users cascade`;
    await closeServerDatabase();
    await connection.client.end();
  });

  it("attaches the merchant to the exact owner and mints real merchant claims", async () => {
    const identity = {
      email: "leash-first@example.test",
      magicIssuer: `did:ethr:${randomUUID()}`,
      receivingAddress: "0x1111111111111111111111111111111111111111",
    };
    const [owner] = await connection.client<{ id: string }[]>`
      insert into users (email, magic_issuer)
      values (${identity.email}, ${identity.magicIssuer})
      returning id
    `;
    if (!owner) throw new Error("PostgreSQL did not return the owner");
    magicBoundary.verifyMerchantDidToken.mockResolvedValue(identity);

    const response = await POST(
      request({ didToken: "verified.did.token", email: identity.email, flow: "signup" }),
    );
    const session = await readSessionToken(cookieToken(response), sessionSecret);

    expect(response.status).toBe(200);
    await expect(response.clone().json()).resolves.toEqual({ redirectTo: "/dashboard/quickstart" });
    expect(session).toMatchObject({ email: identity.email, mode: "test", userId: owner.id });
    expect(session).toHaveProperty("merchantId");
    const [counts] = await connection.client<
      { merchantsCount: number; usersCount: number }[]
    >`select
        (select count(*)::int from users) as "usersCount",
        (select count(*)::int from merchants) as "merchantsCount"`;
    expect(counts).toEqual({ merchantsCount: 1, usersCount: 1 });
  });
});
