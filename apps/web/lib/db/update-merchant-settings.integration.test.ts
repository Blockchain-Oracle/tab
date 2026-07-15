import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "./client";
import { provisionMerchant } from "./provision-merchant";
import { merchants } from "./schema";
import { updateMerchantSettings } from "./update-merchant-settings";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for merchant settings tests");

const connection = createDatabase(databaseUrl, 1);
const originalAddress = "0x1111111111111111111111111111111111111111";
const confirmedAddress = "0x2222222222222222222222222222222222222222";

describe("merchant settings compare-and-swap with real PostgreSQL", () => {
  beforeEach(async () => {
    await connection.client`
      truncate table quickstart_progress, api_keys, merchants, users cascade
    `;
  });

  afterAll(async () => {
    await connection.client.end();
  });

  it("refuses a stale write after another request changes the receiving address", async () => {
    const identity = await provisionMerchant(connection.db, {
      email: `settings-race-${randomUUID()}@example.test`,
      magicIssuer: `did:ethr:${randomUUID()}`,
      receivingAddress: originalAddress,
    });
    await connection.db
      .update(merchants)
      .set({ receivingAddress: confirmedAddress, receivingAddressSource: "custom" })
      .where(eq(merchants.id, identity.merchantId));

    const staleResult = await updateMerchantSettings(connection.db, {
      businessName: "Stale request",
      expectedBusinessName: null,
      expectedReceivingAddress: originalAddress,
      merchantId: identity.merchantId,
      receivingAddress: originalAddress,
      receivingAddressSource: "magic_default",
    });

    expect(staleResult).toBeUndefined();
    const [row] = await connection.db
      .select({
        businessName: merchants.businessName,
        receivingAddress: merchants.receivingAddress,
        receivingAddressSource: merchants.receivingAddressSource,
      })
      .from(merchants)
      .where(eq(merchants.id, identity.merchantId));
    expect(row).toEqual({
      businessName: null,
      receivingAddress: confirmedAddress,
      receivingAddressSource: "custom",
    });
  });

  it("refuses to overwrite a concurrent business-name change", async () => {
    const identity = await provisionMerchant(connection.db, {
      email: `settings-name-race-${randomUUID()}@example.test`,
      magicIssuer: `did:ethr:${randomUUID()}`,
      receivingAddress: originalAddress,
    });
    await connection.db
      .update(merchants)
      .set({ businessName: "Newer name" })
      .where(eq(merchants.id, identity.merchantId));

    const staleResult = await updateMerchantSettings(connection.db, {
      businessName: "Stale name",
      expectedBusinessName: null,
      expectedReceivingAddress: originalAddress,
      merchantId: identity.merchantId,
      receivingAddress: originalAddress,
      receivingAddressSource: "magic_default",
    });

    expect(staleResult).toBeUndefined();
    const [row] = await connection.db
      .select({ businessName: merchants.businessName })
      .from(merchants)
      .where(eq(merchants.id, identity.merchantId));
    expect(row?.businessName).toBe("Newer name");
  });
});
