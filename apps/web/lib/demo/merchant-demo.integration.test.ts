import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import { provisionMerchant } from "../db/provision-merchant";
import { merchants } from "../db/schema";
import { readMerchantDemo } from "./merchant-demo";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for merchant demo tests");
const connection = createDatabase(databaseUrl, 1);

describe("merchant demo projection with real PostgreSQL", () => {
  beforeEach(async () => {
    await connection.client`truncate table users cascade`;
  });

  afterAll(async () => {
    await connection.client.end();
  });

  it("returns only the signed tenant's real settings and test publishable key", async () => {
    const identity = await provisionMerchant(connection.db, {
      email: `merchant-demo-${randomUUID()}@example.test`,
      magicIssuer: `did:ethr:${randomUUID()}`,
      receivingAddress: "0x1111111111111111111111111111111111111111",
    });
    await connection.db
      .update(merchants)
      .set({ businessName: "Harbor Works", logoUrl: "https://assets.example.test/harbor.png" })
      .where(eq(merchants.id, identity.merchantId));

    const demo = await readMerchantDemo(connection.db, identity.merchantId);
    expect(demo).toMatchObject({
      businessName: "Harbor Works",
      logoUrl: "https://assets.example.test/harbor.png",
      publishableKey: expect.stringMatching(/^pk_test_/),
    });
  });
});
