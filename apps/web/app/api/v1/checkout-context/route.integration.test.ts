import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../../../../lib/db/client";
import { provisionMerchant } from "../../../../lib/db/provision-merchant";
import { merchants } from "../../../../lib/db/schema";
import { closeServerDatabase } from "../../../../lib/db/server";
import { GET, OPTIONS } from "./route";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for checkout-context route tests");

const connection = createDatabase(databaseUrl, 4);
const configKeys = [
  "NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY",
  "PARTICLE_PROJECT_ID",
  "PARTICLE_CLIENT_KEY",
  "PARTICLE_APP_ID",
] as const;
const originalConfig = Object.fromEntries(configKeys.map((key) => [key, process.env[key]]));

function request(publishableKey: string) {
  return new NextRequest("http://localhost/api/v1/checkout-context", {
    headers: { authorization: `Bearer ${publishableKey}` },
  });
}

describe("GET /api/v1/checkout-context with real PostgreSQL", () => {
  beforeEach(async () => {
    process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY = "pk_live_magic_public";
    process.env.PARTICLE_PROJECT_ID = "particle-project";
    process.env.PARTICLE_CLIENT_KEY = "particle-client";
    process.env.PARTICLE_APP_ID = "particle-app";
    await connection.client`truncate table users cascade`;
  });

  afterAll(async () => {
    for (const key of configKeys) {
      const original = originalConfig[key];
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
    await closeServerDatabase();
    await connection.client.end();
  });

  it("returns only real tenant display data and public SDK configuration", async () => {
    const identity = await provisionMerchant(connection.db, {
      email: `checkout-${randomUUID()}@example.test`,
      magicIssuer: `did:ethr:${randomUUID()}`,
      receivingAddress: "0x1111111111111111111111111111111111111111",
    });
    await connection.db
      .update(merchants)
      .set({ businessName: "Confirmed Merchant", logoUrl: "https://cdn.example.test/logo.png" })
      .where(eq(merchants.id, identity.merchantId));

    const response = await GET(request(identity.publishableKeys.test));

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({
      capabilities: { livePaymentExecution: false },
      clientConfig: {
        magicPublishableKey: "pk_live_magic_public",
        particle: {
          projectAppUuid: "particle-app",
          projectClientKey: "particle-client",
          projectId: "particle-project",
        },
      },
      merchant: {
        businessName: "Confirmed Merchant",
        logoUrl: "https://cdn.example.test/logo.png",
      },
      mode: "test",
    });
  });

  it("fails closed when any public integration setting is absent", async () => {
    const identity = await provisionMerchant(connection.db, {
      email: `missing-${randomUUID()}@example.test`,
      magicIssuer: `did:ethr:${randomUUID()}`,
      receivingAddress: "0x2222222222222222222222222222222222222222",
    });
    delete process.env.PARTICLE_APP_ID;

    const response = await GET(request(identity.publishableKeys.test));

    expect(response.status).toBe(503);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CHECKOUT_CONFIGURATION_UNAVAILABLE" },
    });
  });

  it("supports credential-free browser preflight", async () => {
    const response = await OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain("GET");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });
});
