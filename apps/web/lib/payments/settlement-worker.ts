import type { Database } from "../db/client";
import {
  claimLivePaymentById,
  claimStaleLivePayment,
  deferVerificationClaim,
} from "./verification-store";
import {
  type LiveVerificationTrigger,
  liveSettlementVerificationAvailable,
  verifyReportedLivePayment,
} from "./verify";

const DEFAULT_MAX_PAYMENTS = 8;
const HARD_MAX_PAYMENTS = 25;
const DEFAULT_STALE_AFTER_MS = 60_000;
const DEFAULT_RETRY_AFTER_MS = 60_000;

export interface SettlementQueueOptions {
  maxPayments?: number;
  retryAfterMs?: number;
  staleAfterMs?: number;
}

export class LiveSettlementVerificationBlockedError extends Error {
  readonly code = "LIVE_SETTLEMENT_VERIFICATION_BLOCKED";

  constructor() {
    super("Live settlement verification is blocked on the funded B-04 spike.");
    this.name = "LiveSettlementVerificationBlockedError";
  }
}

function paymentBound(value: number | undefined) {
  const bound = value ?? DEFAULT_MAX_PAYMENTS;
  if (!Number.isSafeInteger(bound) || bound < 1 || bound > HARD_MAX_PAYMENTS) {
    throw new Error("Settlement verification batch bound is invalid");
  }
  return bound;
}

async function verifyClaim(
  db: Database,
  claim: NonNullable<Awaited<ReturnType<typeof claimStaleLivePayment>>>,
  trigger: LiveVerificationTrigger,
  retryAfterMs: number,
) {
  const outcome = await verifyReportedLivePayment(claim.payment, trigger);
  if (outcome.status !== "blocked") throw new Error("Unsupported live verification outcome");
  return deferVerificationClaim(db, claim.payment.id, claim.leaseToken, retryAfterMs);
}

export async function verifyLivePaymentById(
  db: Database,
  paymentId: string,
  trigger: LiveVerificationTrigger,
) {
  if (!liveSettlementVerificationAvailable()) {
    return { blocker: "B-04" as const, claimed: false, pending: true };
  }
  const claim = await claimLivePaymentById(db, paymentId);
  if (!claim) return { claimed: false, pending: false };
  const pending = await verifyClaim(db, claim, trigger, DEFAULT_RETRY_AFTER_MS);
  return { claimed: true, pending };
}

export async function drainLiveSettlementQueue(db: Database, options: SettlementQueueOptions = {}) {
  const maxPayments = paymentBound(options.maxPayments);
  const retryAfterMs = options.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS;
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  if (!liveSettlementVerificationAvailable()) {
    throw new LiveSettlementVerificationBlockedError();
  }
  let claimed = 0;
  let examined = 0;
  let pending = 0;

  while (examined < maxPayments) {
    const claim = await claimStaleLivePayment(db, { staleAfterMs });
    if (!claim) break;
    claimed += 1;
    examined += 1;
    if (await verifyClaim(db, claim, "cron_sweep", retryAfterMs)) pending += 1;
  }

  return { claimed, examined, pending };
}
