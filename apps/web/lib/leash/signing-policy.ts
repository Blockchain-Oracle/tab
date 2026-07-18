import { and, eq, sql } from "drizzle-orm";

import type { Database } from "../db/client";
import { caps, receipts } from "../db/schema";
import { findActiveCapHalt } from "./cap-halt-store";
import { ensureCurrentCapCycle } from "./cycles";
import { floatReservationAt, receiptCommitted } from "./receipt-commitment";
import type { SignGateCode } from "./sign-gate";

const ATOMIC_UNITS_PER_CENT = BigInt(10_000);
const MAX_FLOAT_SNAPSHOT_AGE_MS = 10_000;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type FinalSigningPolicyCode = SignGateCode | "FLOAT_EMPTY" | "FLOAT_CHECK_UNAVAILABLE";

export interface FinalSigningPolicyResult {
  code?: FinalSigningPolicyCode;
  cycleId?: string;
  reservedAtomic?: string;
}

export async function finalSigningPolicy(
  transaction: Transaction,
  input: {
    agentId: string;
    floatCheckedAt: Date;
    liveBalanceAtomic: bigint;
    now: Date;
    receipt: typeof receipts.$inferSelect;
  },
): Promise<FinalSigningPolicyResult> {
  if (input.liveBalanceAtomic < BigInt(0)) throw new Error("Float balance cannot be negative");
  const snapshotAge = input.now.getTime() - input.floatCheckedAt.getTime();
  if (
    !Number.isFinite(input.floatCheckedAt.getTime()) ||
    snapshotAge < 0 ||
    snapshotAge > MAX_FLOAT_SNAPSHOT_AGE_MS
  ) {
    return { code: "FLOAT_CHECK_UNAVAILABLE" };
  }

  const [cap] = await transaction
    .select({ amountUsdCents: caps.amountUsdCents, frequency: caps.frequency })
    .from(caps)
    .where(eq(caps.agentId, input.agentId))
    .for("update");
  const cycle = cap
    ? await ensureCurrentCapCycle(transaction, {
        agentId: input.agentId,
        frequency: cap.frequency,
        now: input.now,
      })
    : undefined;
  if (!cap?.amountUsdCents || !cycle) return { code: "LEASH_CAP_NOT_SET" };
  if (cycle.id !== input.receipt.cycleId) return { code: "CAP_CYCLE_CHANGED" };
  if (await findActiveCapHalt(transaction, input.agentId)) {
    return { code: "LEASH_CAP_EXCEEDED", cycleId: cycle.id };
  }

  const [usage] = await transaction
    .select({ amountAtomic: sql<string>`coalesce(sum(${receipts.amountAtomic}), 0)::text` })
    .from(receipts)
    .where(
      and(eq(receipts.agentId, input.agentId), eq(receipts.cycleId, cycle.id), receiptCommitted()),
    );
  if (BigInt(usage?.amountAtomic ?? "0") > BigInt(cap.amountUsdCents) * ATOMIC_UNITS_PER_CENT) {
    return { code: "LEASH_CAP_EXCEEDED", cycleId: cycle.id };
  }

  const [reserved] = await transaction
    .select({ amountAtomic: sql<string>`coalesce(sum(${receipts.amountAtomic}), 0)::text` })
    .from(receipts)
    .where(
      and(
        eq(receipts.agentId, input.agentId),
        eq(receipts.network, input.receipt.network),
        floatReservationAt(input.floatCheckedAt),
      ),
    );
  const reservedAtomic = reserved?.amountAtomic ?? "0";
  if (BigInt(reservedAtomic) > input.liveBalanceAtomic) {
    return { code: "FLOAT_EMPTY", cycleId: cycle.id, reservedAtomic };
  }
  return { cycleId: cycle.id, reservedAtomic };
}
