import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import { provisionMerchant } from "../db/provision-merchant";
import { payments, settlements, webhookDeliveries } from "../db/schema";
import { claimStaleLivePayment, deferVerificationClaim } from "./verification-store";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for verification race tests");

const connection = createDatabase(databaseUrl, 4);

async function expiredClaim() {
  const identity = await provisionMerchant(connection.db, {
    email: `verification-race-${randomUUID()}@example.test`,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x1111111111111111111111111111111111111111",
  });
  const staleToken = randomUUID();
  const [row] = await connection.db
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
      verificationLeaseExpiresAt: new Date(Date.now() - 1_000),
      verificationLeaseToken: staleToken,
    })
    .returning({ id: payments.id });
  if (!row) throw new Error("Expected a payment row");
  return { id: row.id, staleToken };
}

describe("expired settlement verification lease races with real PostgreSQL", () => {
  beforeEach(async () => {
    await connection.client`truncate table users cascade`;
  });

  afterAll(async () => {
    await connection.client.end();
  });

  it("lets exactly one expired owner or successor win the token race", async () => {
    const claim = await expiredClaim();
    const [deferred, reclaimed] = await Promise.all([
      deferVerificationClaim(connection.db, claim.id, claim.staleToken, 60_000),
      claimStaleLivePayment(connection.db, { staleAfterMs: 1_000 }),
    ]);

    expect(Number(deferred) + Number(reclaimed !== null)).toBe(1);
    const [stored] = await connection.db.select().from(payments).where(eq(payments.id, claim.id));
    if (deferred) {
      expect(stored?.verificationLeaseToken).toBeNull();
      expect(stored?.verificationNextAttemptAt).toBeInstanceOf(Date);
    } else {
      expect(stored).toMatchObject({
        verificationLeaseToken: reclaimed?.leaseToken,
        verificationNextAttemptAt: null,
      });
    }
    expect(stored).toMatchObject({ settledAt: null, status: "pending" });
    expect(await connection.db.select().from(settlements)).toHaveLength(0);
    expect(await connection.db.select().from(webhookDeliveries)).toHaveLength(0);
  });
});
