import { randomUUID } from "node:crypto";

import { and, asc, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import type { Database } from "../db/client";
import { payments } from "../db/schema";
import type { ReportedLivePayment } from "./verify";

const DEFAULT_LEASE_MS = 30_000;

function duration(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a safe integer`);
  return value;
}

function eligibleReportedLivePayment() {
  return and(
    eq(payments.env, "live"),
    eq(payments.livemode, true),
    eq(payments.status, "pending"),
    isNotNull(payments.payerAddress),
    isNotNull(payments.reportedAt),
    isNotNull(payments.reportedTokenChanges),
    isNotNull(payments.reportedTransactionId),
  );
}

function claimableLease() {
  return or(
    isNull(payments.verificationLeaseToken),
    lte(payments.verificationLeaseExpiresAt, sql`clock_timestamp()`),
  );
}

function asCandidate(payment: typeof payments.$inferSelect): ReportedLivePayment {
  if (!payment.payerAddress || !payment.reportedTokenChanges || !payment.reportedTransactionId) {
    throw new Error("Claimed live payment has incomplete verification evidence");
  }
  return {
    amountUsd: payment.amountUsd,
    id: payment.id,
    payerAddress: payment.payerAddress,
    receiver: payment.receiver,
    reportedTokenChanges: payment.reportedTokenChanges,
    reportedTransactionId: payment.reportedTransactionId,
    tokenAddress: payment.tokenAddress,
    tokenChainId: payment.tokenChainId,
  };
}

async function claim(db: Database, conditions: ReturnType<typeof and>, leaseMs = DEFAULT_LEASE_MS) {
  duration(leaseMs, "Verification lease duration");
  if (leaseMs === 0) throw new Error("Verification lease duration must be positive");
  return db.transaction(async (transaction) => {
    const [payment] = await transaction
      .select()
      .from(payments)
      .where(conditions)
      .orderBy(asc(payments.reportedAt), asc(payments.id))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!payment) return null;

    const leaseToken = randomUUID();
    const [claimed] = await transaction
      .update(payments)
      .set({
        verificationLeaseExpiresAt: sql`clock_timestamp() + (${leaseMs} * interval '1 millisecond')`,
        verificationLeaseToken: leaseToken,
      })
      .where(and(eq(payments.id, payment.id), claimableLease()))
      .returning();
    if (!claimed) return null;
    return { leaseToken, payment: asCandidate(claimed) };
  });
}

export function claimLivePaymentById(db: Database, id: string, leaseMs = DEFAULT_LEASE_MS) {
  return claim(
    db,
    and(
      eligibleReportedLivePayment(),
      eq(payments.id, id),
      or(
        isNull(payments.verificationNextAttemptAt),
        lte(payments.verificationNextAttemptAt, sql`clock_timestamp()`),
      ),
      claimableLease(),
    ),
    leaseMs,
  );
}

export function claimStaleLivePayment(
  db: Database,
  options: { leaseMs?: number; staleAfterMs: number },
) {
  const staleAfterMs = duration(options.staleAfterMs, "Verification stale threshold");
  return claim(
    db,
    and(
      eligibleReportedLivePayment(),
      lte(
        payments.reportedAt,
        sql`clock_timestamp() - (${staleAfterMs} * interval '1 millisecond')`,
      ),
      or(
        isNull(payments.verificationNextAttemptAt),
        lte(payments.verificationNextAttemptAt, sql`clock_timestamp()`),
      ),
      claimableLease(),
    ),
    options.leaseMs,
  );
}

export async function deferVerificationClaim(
  db: Database,
  paymentId: string,
  leaseToken: string,
  retryAfterMs: number,
) {
  duration(retryAfterMs, "Verification retry delay");
  const [finalized] = await db
    .update(payments)
    .set({
      verificationLeaseExpiresAt: null,
      verificationLeaseToken: null,
      verificationNextAttemptAt: sql`clock_timestamp() + (${retryAfterMs} * interval '1 millisecond')`,
    })
    .where(
      and(
        eq(payments.id, paymentId),
        eq(payments.status, "pending"),
        eq(payments.verificationLeaseToken, leaseToken),
      ),
    )
    .returning({ id: payments.id });
  return Boolean(finalized);
}
