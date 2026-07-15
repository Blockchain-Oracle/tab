import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import { provisionMerchant } from "../db/provision-merchant";
import { payments, settlements, webhookDeliveries } from "../db/schema";
import {
  drainLiveSettlementQueue,
  LiveSettlementVerificationBlockedError,
  verifyLivePaymentById,
} from "./settlement-worker";
import { claimStaleLivePayment, deferVerificationClaim } from "./verification-store";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for settlement worker tests");

const connection = createDatabase(databaseUrl, 6);
const payerAddress = "0x9999999999999999999999999999999999999999";

async function merchant() {
  return provisionMerchant(connection.db, {
    email: `settle-sweep-${randomUUID()}@example.test`,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x1111111111111111111111111111111111111111",
  });
}

interface PaymentOptions {
  activeLease?: boolean;
  env?: "live" | "test";
  leaseExpiresInMs?: number;
  nextAttemptInMs?: number;
  reportedAgeMs?: number;
  reported?: boolean;
  stale?: boolean;
}

async function payment(merchantId: string, options: PaymentOptions = {}) {
  const env = options.env ?? "live";
  const reported = options.reported ?? true;
  const leaseExpiresInMs = options.leaseExpiresInMs ?? (options.activeLease ? 60_000 : undefined);
  const [row] = await connection.db
    .insert(payments)
    .values({
      amountUsd: "7.250000",
      currency: "USD",
      env,
      intentUrl: "https://merchant.example.test/payment-intent",
      livemode: env === "live",
      merchantId,
      payerAddress: reported ? payerAddress : null,
      refCode: `TAB-${randomUUID().slice(0, 8).toUpperCase()}`,
      receiver: "0x1111111111111111111111111111111111111111",
      reportedAt: reported
        ? new Date(Date.now() - (options.reportedAgeMs ?? (options.stale === false ? 0 : 120_000)))
        : null,
      reportedTokenChanges: reported ? [] : null,
      reportedTransactionId: reported ? `live_candidate_${randomUUID()}` : null,
      tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      tokenChainId: 42161,
      verificationLeaseExpiresAt:
        leaseExpiresInMs === undefined ? null : new Date(Date.now() + leaseExpiresInMs),
      verificationLeaseToken: leaseExpiresInMs === undefined ? null : randomUUID(),
      verificationNextAttemptAt:
        options.nextAttemptInMs === undefined
          ? null
          : new Date(Date.now() + options.nextAttemptInMs),
    })
    .returning({ id: payments.id });
  if (!row) throw new Error("Expected a payment row");
  return row.id;
}

async function assertNoMoneyMoved() {
  expect(await connection.db.select().from(settlements)).toHaveLength(0);
  expect(await connection.db.select().from(webhookDeliveries)).toHaveLength(0);
  const rows = await connection.db.select().from(payments);
  expect(rows.every((row) => row.status === "pending" && row.settledAt === null)).toBe(true);
}

describe("fail-closed live settlement worker with real PostgreSQL", () => {
  beforeEach(async () => {
    await connection.client`truncate table users cascade`;
  });

  afterAll(async () => {
    await connection.client.end();
  });

  it("claims only stale, due, reported live payments", async () => {
    const identity = await merchant();
    const eligibleId = await payment(identity.merchantId);
    const freshId = await payment(identity.merchantId, { stale: false });
    const unreportedId = await payment(identity.merchantId, { reported: false });
    const testId = await payment(identity.merchantId, { env: "test" });
    const leasedId = await payment(identity.merchantId, { activeLease: true });
    const futureId = await payment(identity.merchantId, { nextAttemptInMs: 60_000 });

    const claim = await claimStaleLivePayment(connection.db, { staleAfterMs: 1_000 });
    expect(claim?.payment.id).toBe(eligibleId);
    expect(await claimStaleLivePayment(connection.db, { staleAfterMs: 1_000 })).toBeNull();

    const rows = await connection.db.select().from(payments);
    expect(rows.find((row) => row.id === eligibleId)?.verificationLeaseToken).toBe(
      claim?.leaseToken,
    );
    for (const id of [freshId, unreportedId, testId, futureId]) {
      expect(rows.find((row) => row.id === id)?.verificationLeaseToken).toBeNull();
    }
    expect(rows.find((row) => row.id === leasedId)?.verificationLeaseToken).not.toBeNull();
    await assertNoMoneyMoved();
  });

  it("gives concurrent claimers disjoint rows", async () => {
    const identity = await merchant();
    const oldest = await payment(identity.merchantId, { reportedAgeMs: 180_000 });
    const middle = await payment(identity.merchantId, { reportedAgeMs: 120_000 });
    const newest = await payment(identity.merchantId, { reportedAgeMs: 60_000 });

    const claims = await Promise.all([
      claimStaleLivePayment(connection.db, { staleAfterMs: 1_000 }),
      claimStaleLivePayment(connection.db, { staleAfterMs: 1_000 }),
    ]);

    expect(new Set(claims.map((claim) => claim?.payment.id))).toEqual(new Set([oldest, middle]));
    expect((await claimStaleLivePayment(connection.db, { staleAfterMs: 1_000 }))?.payment.id).toBe(
      newest,
    );
    await assertNoMoneyMoved();
  });

  it("uses token CAS when deferring a claim and prevents immediate re-claim", async () => {
    const identity = await merchant();
    const id = await payment(identity.merchantId);
    const claim = await claimStaleLivePayment(connection.db, { staleAfterMs: 1_000 });
    if (!claim) throw new Error("Expected a verification claim");

    await expect(deferVerificationClaim(connection.db, id, randomUUID(), 60_000)).resolves.toBe(
      false,
    );
    await expect(deferVerificationClaim(connection.db, id, claim.leaseToken, 60_000)).resolves.toBe(
      true,
    );
    expect(await claimStaleLivePayment(connection.db, { staleAfterMs: 1_000 })).toBeNull();

    const [stored] = await connection.db.select().from(payments).where(eq(payments.id, id));
    expect(stored).toMatchObject({
      status: "pending",
      verificationLeaseToken: null,
    });
    expect(stored?.verificationNextAttemptAt?.getTime()).toBeGreaterThan(Date.now());
    await assertNoMoneyMoved();
  });

  it("reclaims an expired lease without letting the stale owner clear it", async () => {
    const identity = await merchant();
    const id = await payment(identity.merchantId, { leaseExpiresInMs: -1_000 });
    const [before] = await connection.db.select().from(payments).where(eq(payments.id, id));
    const staleToken = before?.verificationLeaseToken;
    if (!staleToken) throw new Error("Expected the expired lease token");

    const claim = await claimStaleLivePayment(connection.db, { staleAfterMs: 1_000 });
    expect(claim?.payment.id).toBe(id);
    expect(claim?.leaseToken).not.toBe(staleToken);
    await expect(deferVerificationClaim(connection.db, id, staleToken, 60_000)).resolves.toBe(
      false,
    );

    const [stored] = await connection.db.select().from(payments).where(eq(payments.id, id));
    expect(stored?.verificationLeaseToken).toBe(claim?.leaseToken);
    await assertNoMoneyMoved();
  });

  it("preflights the B-04 blocker inline and in the bounded worker without mutation", async () => {
    const identity = await merchant();
    const id = await payment(identity.merchantId, { stale: false });

    await expect(verifyLivePaymentById(connection.db, id, "inline")).resolves.toEqual({
      blocker: "B-04",
      claimed: false,
      pending: true,
    });
    await expect(drainLiveSettlementQueue(connection.db)).rejects.toBeInstanceOf(
      LiveSettlementVerificationBlockedError,
    );

    const [stored] = await connection.db.select().from(payments).where(eq(payments.id, id));
    expect(stored).toMatchObject({
      verificationLeaseToken: null,
      verificationNextAttemptAt: null,
    });
    await assertNoMoneyMoved();
  });
});
