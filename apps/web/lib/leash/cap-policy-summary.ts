import { and, eq, or, sql } from "drizzle-orm";

import type { Database } from "../db/client";
import { receipts } from "../db/schema";
import { deriveCapDisplay } from "./cap-display";
import { findActiveCapHalt } from "./cap-halt-store";
import { type CapFrequency, deriveCycleWindow } from "./cycles";
import { receiptCommitted, revertedReceiptEvidence } from "./receipt-commitment";

const ATOMIC_UNITS_PER_CENT = BigInt(10_000);
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type PolicyCycle = {
  id: string;
  nextResetAt?: Date | null;
  startedAt: Date;
};

async function usage(transaction: Transaction, agentId: string, cycleId: string) {
  const [row] = await transaction
    .select({
      blockedReceiptCount: sql<number>`count(*) filter
        (where ${receipts.status} = 'blocked')::integer`,
      pendingAtomic: sql<string>`coalesce(sum(${receipts.amountAtomic}) filter
        (where ${receipts.status} = 'pending'), 0)::text`,
      revertedAtomic: sql<string>`coalesce(sum(${receipts.amountAtomic}) filter
        (where ${revertedReceiptEvidence()}), 0)::text`,
      settledAtomic: sql<string>`coalesce(sum(${receipts.amountAtomic}) filter
        (where ${receipts.status} = 'settled'), 0)::text`,
    })
    .from(receipts)
    .where(
      and(
        eq(receipts.agentId, agentId),
        eq(receipts.cycleId, cycleId),
        or(eq(receipts.status, "blocked"), receiptCommitted()),
      ),
    );
  return {
    blockedReceiptCount: row?.blockedReceiptCount ?? 0,
    pendingAtomic: row?.pendingAtomic ?? "0",
    revertedAtomic: row?.revertedAtomic ?? "0",
    settledAtomic: row?.settledAtomic ?? "0",
  };
}

export async function capPolicySummary(
  transaction: Transaction,
  input: {
    agentId: string;
    amountUsdCents: string;
    cycle: PolicyCycle;
    frequency: CapFrequency;
    updatedAt: Date;
  },
) {
  const currentUsage = await usage(transaction, input.agentId, input.cycle.id);
  const spend = {
    blockedReceiptCount: currentUsage.blockedReceiptCount,
    ...deriveCapDisplay({
      capUsdCents: input.amountUsdCents,
      pendingAtomic: currentUsage.pendingAtomic,
      revertedAtomic: currentUsage.revertedAtomic,
      settledAtomic: currentUsage.settledAtomic,
    }),
  };
  const activeHalt = await findActiveCapHalt(transaction, input.agentId);
  return {
    agentId: input.agentId,
    cap: {
      amountUsdCents: input.amountUsdCents,
      frequency: input.frequency,
      updatedAt: input.updatedAt,
    },
    cycle: {
      id: input.cycle.id,
      nextResetAt:
        input.cycle.nextResetAt === undefined
          ? deriveCycleWindow(input.cycle.startedAt, input.frequency, input.cycle.startedAt)
              .nextResetAt
          : input.cycle.nextResetAt,
      startedAt: input.cycle.startedAt,
    },
    halted:
      activeHalt !== undefined ||
      BigInt(spend.committedAtomic) >= BigInt(input.amountUsdCents) * ATOMIC_UNITS_PER_CENT,
    spend,
  };
}

export type CapPolicySummary = Awaited<ReturnType<typeof capPolicySummary>>;
