import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../../../../lib/db/client";
import { closeServerDatabase } from "../../../../lib/db/server";
import { POST } from "./route";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for PostgreSQL integration tests");
}

const originalMagicSecret = process.env.MAGIC_SECRET_KEY;
const originalSessionSecret = process.env.SESSION_SECRET;
const connection = createDatabase(databaseUrl, 1);

function request(body: unknown, origin = "http://localhost") {
  return new Request("http://localhost/api/auth/verify", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", origin },
    method: "POST",
  });
}

describe("POST /api/auth/verify without a fake identity path", () => {
  beforeEach(async () => {
    delete process.env.MAGIC_SECRET_KEY;
    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }
    await connection.client`
      truncate table quickstart_progress, api_keys, merchants, users cascade
    `;
  });

  afterEach(() => {
    if (originalMagicSecret === undefined) {
      delete process.env.MAGIC_SECRET_KEY;
    } else {
      process.env.MAGIC_SECRET_KEY = originalMagicSecret;
    }
    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }
  });

  afterAll(async () => {
    await closeServerDatabase();
    await connection.client.end();
  });

  it("rejects malformed input before attempting authentication", async () => {
    const response = await POST(request({ didToken: "token", flow: "unknown" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_AUTH_REQUEST",
        message: "A DID token and valid auth flow are required.",
      },
    });
  });

  it("rejects a cross-origin session-creation request", async () => {
    const response = await POST(
      request({ didToken: "real-token-required", flow: "signup" }, "https://attacker.example"),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "ORIGIN_NOT_ALLOWED",
        message: "Request origin is not allowed.",
      },
    });
  });

  it("returns an honest configuration blocker and creates no tenant", async () => {
    const response = await POST(request({ didToken: "real-token-required", flow: "signup" }));
    const [counts] = await connection.client<
      { merchants_count: number; users_count: number }[]
    >`select
        (select count(*)::int from users) as users_count,
        (select count(*)::int from merchants) as merchants_count`;

    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "MAGIC_NOT_CONFIGURED",
        message: "Magic authentication is not configured.",
      },
    });
    expect(counts).toEqual({ merchants_count: 0, users_count: 0 });
  });

  it("blocks before contacting Magic when session signing is not configured", async () => {
    process.env.MAGIC_SECRET_KEY = "configured-for-boundary-check";
    delete process.env.SESSION_SECRET;

    const response = await POST(request({ didToken: "not-contacted", flow: "signup" }));

    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "SESSION_NOT_CONFIGURED",
        message: "Session signing is not configured.",
      },
    });
  });
});
