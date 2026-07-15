import { randomBytes, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { provisionMerchant } from "../../../../lib/db/provision-merchant";
import { payments, settlements, webhookDeliveries } from "../../../../lib/db/schema";
import { closeServerDatabase, getServerDatabase } from "../../../../lib/db/server";
import { GET } from "./route";

const originalCronSecret = process.env.CRON_SECRET;
const cronSecret = randomBytes(32).toString("base64url");

function request(authorization?: string) {
  return new NextRequest("http://localhost/api/internal/settle-sweep", {
    headers: authorization ? { authorization } : {},
  });
}

async function reportedLivePayment() {
  const database = getServerDatabase().db;
  const identity = await provisionMerchant(database, {
    email: `settle-route-${randomUUID()}@example.test`,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x1111111111111111111111111111111111111111",
  });
  const [row] = await database
    .insert(payments)
    .values({
      amountUsd: "7.250000",
      currency: "USD",
      env: "live",
      intentUrl: "https://merchant.example.test/payment-intent",
      livemode: true,
      merchantId: identity.merchantId,
      payerAddress: "0x9999999999999999999999999999999999999999",
      refCode: `TAB-${randomUUID().slice(0, 8).toUpperCase()}`,
      receiver: "0x1111111111111111111111111111111111111111",
      reportedAt: new Date(Date.now() - 120_000),
      reportedTokenChanges: [],
      reportedTransactionId: `live_candidate_${randomUUID()}`,
      tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      tokenChainId: 42161,
    })
    .returning({ id: payments.id });
  if (!row) throw new Error("Expected a payment row");
  return row.id;
}

beforeEach(async () => {
  process.env.CRON_SECRET = cronSecret;
  await getServerDatabase().client`truncate table users cascade`;
});

afterAll(async () => {
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalCronSecret;
  await closeServerDatabase();
});

describe("authenticated live settlement sweep route", () => {
  it.each([
    undefined,
    "Bearer wrong-secret",
  ])("rejects an untrusted scheduler without claiming work", async (authorization) => {
    const id = await reportedLivePayment();
    const response = await GET(request(authorization));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const [stored] = await getServerDatabase()
      .db.select()
      .from(payments)
      .where(eq(payments.id, id));
    expect(stored?.verificationLeaseToken).toBeNull();
    expect(stored?.verificationNextAttemptAt).toBeNull();
  });

  it("fails closed when the deployment has no cron secret", async () => {
    const id = await reportedLivePayment();
    delete process.env.CRON_SECRET;
    expect((await GET(request(`Bearer ${cronSecret}`))).status).toBe(401);
    const [stored] = await getServerDatabase()
      .db.select()
      .from(payments)
      .where(eq(payments.id, id));
    expect(stored?.verificationLeaseToken).toBeNull();
    expect(stored?.verificationNextAttemptAt).toBeNull();
  });

  it("returns the named B-04 blocker without mutating live money state", async () => {
    await reportedLivePayment();
    const response = await GET(request(`Bearer ${cronSecret}`));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "LIVE_SETTLEMENT_VERIFICATION_BLOCKED" },
    });
    expect(await getServerDatabase().db.select().from(settlements)).toHaveLength(0);
    expect(await getServerDatabase().db.select().from(webhookDeliveries)).toHaveLength(0);
    const [stored] = await getServerDatabase().db.select().from(payments);
    expect(stored).toMatchObject({ status: "pending", settledAt: null });
    expect(stored).toMatchObject({
      verificationLeaseToken: null,
      verificationNextAttemptAt: null,
    });
  });
});
