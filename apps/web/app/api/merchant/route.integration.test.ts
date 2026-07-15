import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createSessionToken, SESSION_COOKIE_NAME } from "../../../lib/auth/session";
import { createDatabase } from "../../../lib/db/client";
import { provisionMerchant } from "../../../lib/db/provision-merchant";
import { merchants } from "../../../lib/db/schema";
import { closeServerDatabase } from "../../../lib/db/server";
import { GET, PATCH } from "./route";

const databaseUrl = process.env.DATABASE_URL;
const sessionSecret = process.env.SESSION_SECRET;
const appOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost").origin;

if (!databaseUrl || !sessionSecret) {
  throw new Error("DATABASE_URL and SESSION_SECRET are required for merchant integration tests");
}

const connection = createDatabase(databaseUrl, 1);
const defaultAddress = "0x1111111111111111111111111111111111111111";
const customAddress = "0x2222222222222222222222222222222222222222";
const checksummedAddress = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const unchangedSettings = {
  businessName: null,
  receivingAddress: defaultAddress,
  receivingAddressSource: "magic_default",
} as const;

function request(body: unknown, token?: string, origin = appOrigin) {
  return new NextRequest(`${appOrigin}/api/merchant`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...(token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
      origin,
    },
    method: "PATCH",
  });
}

function readRequest(token?: string) {
  return new NextRequest(`${appOrigin}/api/merchant`, {
    ...(token ? { headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } } : {}),
    method: "GET",
  });
}

async function merchantSession(email: string) {
  const identity = await provisionMerchant(connection.db, {
    email,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: defaultAddress,
  });
  const token = await createSessionToken({ ...identity, email, mode: "test" });
  return { ...identity, token };
}

async function merchantRow(merchantId: string) {
  const [row] = await connection.db
    .select({
      businessName: merchants.businessName,
      receivingAddress: merchants.receivingAddress,
      receivingAddressSource: merchants.receivingAddressSource,
    })
    .from(merchants)
    .where(eq(merchants.id, merchantId));
  return row;
}

async function expectUnchanged(merchantId: string) {
  await expect(merchantRow(merchantId)).resolves.toEqual(unchangedSettings);
}

function validUpdate(overrides: Record<string, unknown> = {}) {
  return {
    businessName: "Example Merchant",
    confirmReceivingAddressChange: false,
    receivingAddress: defaultAddress,
    ...overrides,
  };
}

describe("PATCH /api/merchant with real PostgreSQL", () => {
  beforeEach(async () => {
    await connection.client`
      truncate table quickstart_progress, api_keys, merchants, users cascade
    `;
  });

  afterAll(async () => {
    await closeServerDatabase();
    await connection.client.end();
  });

  it("requires a valid signed merchant session", async () => {
    const identity = await merchantSession("session@example.test");

    const missing = await PATCH(request(validUpdate()));
    const invalid = await PATCH(request(validUpdate(), "not-a-jwt"));

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    await expectUnchanged(identity.merchantId);
  });

  it("reads authoritative settings only for a valid signed session", async () => {
    const identity = await merchantSession("read@example.test");
    const missing = await GET(readRequest());
    const response = await GET(readRequest(identity.token));

    expect(missing.status).toBe(401);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      merchant: { ...unchangedSettings, logoEtag: null, logoUrl: null },
    });
  });

  it("rejects cross-origin mutations before changing the tenant", async () => {
    const identity = await merchantSession("origin@example.test");

    const response = await PATCH(
      request(validUpdate(), identity.token, "https://attacker.example"),
    );

    expect(response.status).toBe(403);
    await expectUnchanged(identity.merchantId);
  });

  it("rejects malformed and oversized business names without a database mutation", async () => {
    const identity = await merchantSession("name-validation@example.test");

    for (const businessName of [{ invalid: true }, "x".repeat(101)]) {
      const response = await PATCH(request(validUpdate({ businessName }), identity.token));

      expect(response.status).toBe(400);
    }

    const whitespace = await PATCH(
      request(validUpdate({ businessName: "   \n  " }), identity.token),
    );
    expect(whitespace.status).toBe(200);
    await expectUnchanged(identity.merchantId);
  });

  it("rejects invalid, zero, and bad-checksum addresses without a database mutation", async () => {
    const identity = await merchantSession("address-validation@example.test");

    for (const receivingAddress of [
      "0xnot-an-address",
      "0x0000000000000000000000000000000000000000",
      "0xAf88d065e77c8cC2239327C5EDb3A432268e5831",
    ]) {
      const response = await PATCH(request(validUpdate({ receivingAddress }), identity.token));

      expect(response.status).toBe(400);
    }
    await expectUnchanged(identity.merchantId);
  });

  it("canonicalizes a valid lowercase receiving address", async () => {
    const identity = await merchantSession("address-normalization@example.test");
    const response = await PATCH(
      request(
        validUpdate({
          confirmReceivingAddressChange: true,
          receivingAddress: checksummedAddress.toLowerCase(),
        }),
        identity.token,
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      merchant: { receivingAddress: checksummedAddress },
    });
    await expect(merchantRow(identity.merchantId)).resolves.toMatchObject({
      receivingAddress: checksummedAddress,
      receivingAddressSource: "custom",
    });
  });

  it("requires explicit confirmation before changing the receiving address", async () => {
    const identity = await merchantSession("confirmation@example.test");

    const response = await PATCH(
      request(validUpdate({ receivingAddress: customAddress }), identity.token),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "RECEIVING_ADDRESS_CONFIRMATION_REQUIRED" },
    });
    await expectUnchanged(identity.merchantId);
  });

  it("atomically persists a confirmed settings update", async () => {
    const identity = await merchantSession("confirmed@example.test");

    const response = await PATCH(
      request(
        validUpdate({
          businessName: "  Confirmed Merchant  ",
          confirmReceivingAddressChange: true,
          receivingAddress: customAddress,
        }),
        identity.token,
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      merchant: {
        businessName: "Confirmed Merchant",
        receivingAddress: customAddress,
        receivingAddressSource: "custom",
      },
    });
    await expect(merchantRow(identity.merchantId)).resolves.toEqual({
      businessName: "Confirmed Merchant",
      receivingAddress: customAddress,
      receivingAddressSource: "custom",
    });
  });

  it("ignores a client-supplied merchant id and updates only the signed tenant", async () => {
    const first = await merchantSession("first@example.test");
    const second = await merchantSession("second@example.test");

    const response = await PATCH(
      request(
        validUpdate({ businessName: "First Merchant", merchantId: second.merchantId }),
        first.token,
      ),
    );

    expect(response.status).toBe(200);
    await expect(merchantRow(first.merchantId)).resolves.toMatchObject({
      businessName: "First Merchant",
    });
    await expectUnchanged(second.merchantId);
  });
});
