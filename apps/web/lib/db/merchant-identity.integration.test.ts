import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "./client";
import { findMerchantIdentity } from "./merchant-identity";
import { provisionMerchant } from "./provision-merchant";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for PostgreSQL integration tests");
}

const connection = createDatabase(databaseUrl, 1);

describe("merchant login identity lookup with real PostgreSQL", () => {
  beforeEach(async () => {
    await connection.client`
      truncate table quickstart_progress, api_keys, merchants, users cascade
    `;
  });

  afterAll(async () => {
    await connection.client.end();
  });

  it("requires the validated Magic issuer and case-insensitive email to match one user", async () => {
    const magicIssuer = `did:ethr:${randomUUID()}`;
    const provisioned = await provisionMerchant(connection.db, {
      email: "owner@example.test",
      magicIssuer,
      receivingAddress: "0x1111111111111111111111111111111111111111",
    });

    await expect(
      findMerchantIdentity(connection.db, "OWNER@example.test", magicIssuer),
    ).resolves.toEqual({
      email: "owner@example.test",
      merchantId: provisioned.merchantId,
      userId: provisioned.userId,
    });
  });

  it("does not authenticate the right email with a different Magic issuer", async () => {
    await provisionMerchant(connection.db, {
      email: "owner@example.test",
      magicIssuer: `did:ethr:${randomUUID()}`,
      receivingAddress: "0x1111111111111111111111111111111111111111",
    });

    await expect(
      findMerchantIdentity(connection.db, "owner@example.test", `did:ethr:${randomUUID()}`),
    ).resolves.toBeUndefined();
  });
});
