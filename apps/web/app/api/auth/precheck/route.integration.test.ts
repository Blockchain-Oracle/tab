import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../../../../lib/db/client";
import { provisionMerchant } from "../../../../lib/db/provision-merchant";
import { closeServerDatabase } from "../../../../lib/db/server";
import { POST } from "./route";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for PostgreSQL integration tests");
}

const connection = createDatabase(databaseUrl, 1);

function request(body: unknown) {
  return new Request("http://localhost/api/auth/precheck", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("POST /api/auth/precheck with real PostgreSQL", () => {
  beforeEach(async () => {
    await connection.client`
      truncate table quickstart_progress, api_keys, merchants, users cascade
    `;
  });

  afterAll(async () => {
    await closeServerDatabase();
    await connection.client.end();
  });

  it("allows signup for an unused email", async () => {
    const response = await POST(request({ email: "new@example.test", flow: "signup" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ allowed: true });
  });

  it("rejects signup for an existing merchant case-insensitively", async () => {
    await provisionMerchant(connection.db, {
      email: "owner@example.test",
      magicIssuer: `did:ethr:${randomUUID()}`,
      receivingAddress: "0x1111111111111111111111111111111111111111",
    });

    const response = await POST(request({ email: "OWNER@example.test", flow: "signup" }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "EMAIL_ALREADY_REGISTERED",
        message: "An account with this email already exists.",
      },
    });
  });

  it("allows signup for an exact Leash-first user who has no merchant yet", async () => {
    const email = "leash-first@example.test";
    await connection.client`
      insert into users (email, magic_issuer)
      values (${email}, ${`did:ethr:${randomUUID()}`})
    `;

    const response = await POST(request({ email, flow: "signup" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ allowed: true });
  });

  it("allows login only for an existing merchant", async () => {
    const missingResponse = await POST(request({ email: "missing@example.test", flow: "login" }));

    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({
      error: {
        code: "EMAIL_NOT_REGISTERED",
        message: "No account exists for this email.",
      },
    });

    await provisionMerchant(connection.db, {
      email: "owner@example.test",
      magicIssuer: `did:ethr:${randomUUID()}`,
      receivingAddress: "0x1111111111111111111111111111111111111111",
    });

    const existingResponse = await POST(request({ email: "owner@example.test", flow: "login" }));

    expect(existingResponse.status).toBe(200);
    await expect(existingResponse.json()).resolves.toEqual({ allowed: true });
  });

  it("rejects invalid email input before querying tenancy", async () => {
    const response = await POST(request({ email: "not-an-email", flow: "signup" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_EMAIL",
        message: "Enter a valid email address.",
      },
    });
  });

  it("reports an invalid auth flow without blaming the email", async () => {
    const response = await POST(request({ email: "owner@example.test", flow: "unknown" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_AUTH_REQUEST",
        message: "Choose signup or login.",
      },
    });
  });
});
