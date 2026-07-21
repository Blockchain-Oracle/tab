import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const magicBoundary = vi.hoisted(() => ({ verifyOwnerDidToken: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("../../../../../lib/auth/magic-admin", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../../../lib/auth/magic-admin")>();
  return { ...original, verifyOwnerDidToken: magicBoundary.verifyOwnerDidToken };
});

import { readSessionToken, SESSION_COOKIE_NAME } from "../../../../../lib/auth/session";
import { createDatabase } from "../../../../../lib/db/client";
import { provisionMerchant } from "../../../../../lib/db/provision-merchant";
import { closeServerDatabase } from "../../../../../lib/db/server";
import { POST } from "./route";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for PostgreSQL integration tests");
}

const sessionSecret = "x".repeat(64);
const originalEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL,
  magicSecret: process.env.MAGIC_SECRET_KEY,
  sessionSecret: process.env.SESSION_SECRET,
};
const connection = createDatabase(databaseUrl, 1);

function request(body: unknown, origin = "http://localhost") {
  return new Request("http://localhost/api/leash/auth/verify", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", origin },
    method: "POST",
  });
}

function sessionCookie(response: Response) {
  const header = response.headers.get("set-cookie");
  if (!header) throw new Error("Expected a session cookie");
  const cookie = header.split(";", 1)[0] ?? "";
  const [name, token] = cookie.split("=", 2);
  expect(name).toBe(SESSION_COOKIE_NAME);
  if (!token) throw new Error("Expected a session token");
  return token;
}

function restore(name: keyof typeof originalEnv, environmentName: string) {
  const value = originalEnv[name];
  if (value === undefined) delete process.env[environmentName];
  else process.env[environmentName] = value;
}

describe("POST /api/leash/auth/verify with real PostgreSQL", () => {
  beforeEach(async () => {
    process.env.MAGIC_SECRET_KEY = "configured-magic-boundary";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost";
    process.env.SESSION_SECRET = sessionSecret;
    magicBoundary.verifyOwnerDidToken.mockReset();
    await connection.client`truncate table users cascade`;
  });

  afterEach(() => {
    restore("appUrl", "NEXT_PUBLIC_APP_URL");
    restore("magicSecret", "MAGIC_SECRET_KEY");
    restore("sessionSecret", "SESSION_SECRET");
  });

  afterAll(async () => {
    await connection.client`truncate table users cascade`;
    await closeServerDatabase();
    await connection.client.end();
  });

  it("creates a new user and issues an owner-only shared session", async () => {
    const magicIssuer = `did:ethr:${randomUUID()}`;
    magicBoundary.verifyOwnerDidToken.mockResolvedValue({
      email: "owner@example.test",
      magicIssuer,
    });

    const response = await POST(
      request({ didToken: "verified.did.token", email: "owner@example.test" }),
    );
    const session = await readSessionToken(sessionCookie(response), sessionSecret);
    const [counts] = await connection.client<
      { merchantsCount: number; usersCount: number }[]
    >`select
        (select count(*)::int from users) as "usersCount",
        (select count(*)::int from merchants) as "merchantsCount"`;

    expect(response.status).toBe(200);
    await expect(response.clone().json()).resolves.toEqual({ redirectTo: "/leash" });
    expect(session).toMatchObject({ email: "owner@example.test" });
    expect(session).not.toHaveProperty("merchantId");
    expect(session).not.toHaveProperty("mode");
    expect(counts).toEqual({ merchantsCount: 0, usersCount: 1 });
  });

  it("reuses a merchant user without fabricating merchant claims", async () => {
    const identity = {
      email: "shared@example.test",
      magicIssuer: `did:ethr:${randomUUID()}`,
    };
    const merchant = await provisionMerchant(connection.db, {
      ...identity,
      receivingAddress: "0x1111111111111111111111111111111111111111",
    });
    magicBoundary.verifyOwnerDidToken.mockResolvedValue(identity);

    const response = await POST(request({ didToken: "verified.did.token", email: identity.email }));
    const session = await readSessionToken(sessionCookie(response), sessionSecret);

    expect(session).toEqual({ email: identity.email, userId: merchant.userId });
    const [counts] = await connection.client<
      { merchantsCount: number; usersCount: number }[]
    >`select
        (select count(*)::int from users) as "usersCount",
        (select count(*)::int from merchants) as "merchantsCount"`;
    expect(counts).toEqual({ merchantsCount: 1, usersCount: 1 });
  });

  it("rejects a persisted Magic session for a different email before provisioning", async () => {
    magicBoundary.verifyOwnerDidToken.mockResolvedValue({
      email: "saved@example.test",
      magicIssuer: `did:ethr:${randomUUID()}`,
    });

    const response = await POST(
      request({ didToken: "saved.did.token", email: "requested@example.test" }),
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("set-cookie")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "MAGIC_EMAIL_MISMATCH",
        message: "This browser's saved Magic session belongs to a different email.",
      },
    });
    const [count] = await connection.client<{ count: number }[]>`
      select count(*)::int as count from users
    `;
    expect(count?.count).toBe(0);
  });

  it("rejects a verified identity collision instead of rebinding the user", async () => {
    const firstIssuer = `did:ethr:${randomUUID()}`;
    await connection.client`
      insert into users (email, magic_issuer)
      values ('bound@example.test', ${firstIssuer})
    `;
    magicBoundary.verifyOwnerDidToken.mockResolvedValue({
      email: "bound@example.test",
      magicIssuer: `did:ethr:${randomUUID()}`,
    });

    const response = await POST(
      request({ didToken: "different.did.token", email: "bound@example.test" }),
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("set-cookie")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "MAGIC_IDENTITY_CONFLICT",
        message: "This Magic identity is already bound to a different Tab account.",
      },
    });
  });

  it("rejects cross-origin session creation before contacting Magic", async () => {
    const response = await POST(
      request(
        { didToken: "verified.did.token", email: "owner@example.test" },
        "https://attacker.example",
      ),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(magicBoundary.verifyOwnerDidToken).not.toHaveBeenCalled();
  });
});
