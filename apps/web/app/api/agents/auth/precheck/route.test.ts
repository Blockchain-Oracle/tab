import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST } from "./route";

const originalEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL,
  databaseUrl: process.env.DATABASE_URL,
  magicSecret: process.env.MAGIC_SECRET_KEY,
  sessionSecret: process.env.SESSION_SECRET,
};

function request(body: unknown, origin = "http://localhost") {
  return new Request("http://localhost/api/leash/auth/precheck", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", origin },
    method: "POST",
  });
}

function restore(name: keyof typeof originalEnv, environmentName: string) {
  const value = originalEnv[name];
  if (value === undefined) delete process.env[environmentName];
  else process.env[environmentName] = value;
}

describe("POST /api/leash/auth/precheck", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://configured.example/tab";
    process.env.MAGIC_SECRET_KEY = "configured-magic-boundary";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost";
    process.env.SESSION_SECRET = "x".repeat(64);
  });

  afterEach(() => {
    restore("appUrl", "NEXT_PUBLIC_APP_URL");
    restore("databaseUrl", "DATABASE_URL");
    restore("magicSecret", "MAGIC_SECRET_KEY");
    restore("sessionSecret", "SESSION_SECRET");
  });

  it("allows any valid owner email because verification finds or creates the principal", async () => {
    const response = await POST(request({ email: "New.Owner@example.test" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ allowed: true });
  });

  it("rejects invalid email before starting Magic", async () => {
    const response = await POST(request({ email: "not-an-email" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: "INVALID_EMAIL", message: "Enter a valid email address." },
    });
  });

  it("rejects a cross-origin precheck", async () => {
    const response = await POST(
      request({ email: "owner@example.test" }, "https://attacker.example"),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: { code: "ORIGIN_NOT_ALLOWED", message: "Request origin is not allowed." },
    });
  });

  it("returns an honest configuration blocker before OTP", async () => {
    delete process.env.MAGIC_SECRET_KEY;
    const magicResponse = await POST(request({ email: "owner@example.test" }));
    expect(magicResponse.status).toBe(503);
    await expect(magicResponse.json()).resolves.toEqual({
      error: {
        code: "MAGIC_NOT_CONFIGURED",
        message: "Magic authentication is not configured.",
      },
    });

    process.env.MAGIC_SECRET_KEY = "configured-magic-boundary";
    delete process.env.SESSION_SECRET;
    const sessionResponse = await POST(request({ email: "owner@example.test" }));
    expect(sessionResponse.status).toBe(503);
    await expect(sessionResponse.json()).resolves.toEqual({
      error: {
        code: "SESSION_NOT_CONFIGURED",
        message: "Session signing is not configured.",
      },
    });

    process.env.SESSION_SECRET = "x".repeat(64);
    delete process.env.DATABASE_URL;
    const databaseResponse = await POST(request({ email: "owner@example.test" }));
    expect(databaseResponse.status).toBe(503);
    await expect(databaseResponse.json()).resolves.toEqual({
      error: {
        code: "DATABASE_NOT_CONFIGURED",
        message: "Owner storage is not configured.",
      },
    });
  });
});
