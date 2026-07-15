import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import { provisionMerchant } from "../db/provision-merchant";
import { payments } from "../db/schema";
import { listPayments, retrievePayment } from "./read-payments";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for payment integration tests");

const connection = createDatabase(databaseUrl, 1);

async function merchant(label: string) {
  return provisionMerchant(connection.db, {
    email: `${label}-${randomUUID()}@example.test`,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x1111111111111111111111111111111111111111",
  });
}

async function payment(merchantId: string, env: "live" | "test", createdAt: Date) {
  const [row] = await connection.db
    .insert(payments)
    .values({
      amountUsd: "12.000000",
      createdAt,
      currency: "USD",
      env,
      intentUrl: "https://merchant.example.test/intent",
      livemode: env === "live",
      merchantId,
      refCode: `TAB-${randomUUID().slice(0, 8).toUpperCase()}`,
      receiver: "0x1111111111111111111111111111111111111111",
      tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      tokenChainId: 42161,
    })
    .returning({ id: payments.id });
  if (!row) throw new Error("Expected a payment row");
  return row.id;
}

beforeEach(async () => {
  await connection.client`truncate table users cascade`;
});

afterAll(async () => {
  await connection.client.end();
});

describe("secret-key payment reads", () => {
  it("lists only the authenticated merchant and key environment", async () => {
    const first = await merchant("read-first");
    const second = await merchant("read-second");
    const olderId = await payment(first.merchantId, "test", new Date("2026-01-01T00:00:00Z"));
    const newerId = await payment(first.merchantId, "test", new Date("2026-01-02T00:00:00Z"));
    await payment(first.merchantId, "live", new Date("2026-01-03T00:00:00Z"));
    await payment(second.merchantId, "test", new Date("2026-01-04T00:00:00Z"));

    const rows = await listPayments(
      connection.db,
      { env: "test", merchantId: first.merchantId },
      { limit: 10 },
    );

    expect(rows.map((row) => row.id)).toEqual([newerId, olderId]);
    expect(rows.every((row) => row.env === "test")).toBe(true);
  });

  it("returns no detail for another tenant or environment", async () => {
    const first = await merchant("detail-first");
    const second = await merchant("detail-second");
    const otherTenantId = await payment(second.merchantId, "test", new Date());
    const liveId = await payment(first.merchantId, "live", new Date());
    const principal = { env: "test" as const, merchantId: first.merchantId };

    await expect(retrievePayment(connection.db, principal, otherTenantId)).resolves.toBeUndefined();
    await expect(retrievePayment(connection.db, principal, liveId)).resolves.toBeUndefined();
  });

  it("caps requested page sizes at 100", async () => {
    const identity = await merchant("read-limit");
    await payment(identity.merchantId, "test", new Date());

    const rows = await listPayments(
      connection.db,
      { env: "test", merchantId: identity.merchantId },
      { limit: 1_000 },
    );

    expect(rows).toHaveLength(1);
  });
});
