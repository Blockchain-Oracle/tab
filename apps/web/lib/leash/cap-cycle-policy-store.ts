import { and, eq, isNull } from "drizzle-orm";

import type { Database } from "../db/client";
import { capCycles, caps } from "../db/schema";
import { LeashCapNotFoundError } from "./cap-policy-errors";
import { ensureCurrentCapCycle } from "./cycles";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type CurrentCycle = NonNullable<Awaited<ReturnType<typeof ensureCurrentCapCycle>>>;

async function activeCycle(transaction: Transaction, agentId: string) {
  const [cycle] = await transaction
    .select({ id: capCycles.id, startedAt: capCycles.startedAt })
    .from(capCycles)
    .where(and(eq(capCycles.agentId, agentId), isNull(capCycles.endedAt)))
    .for("update");
  return cycle;
}

export async function replaceCapCycle(
  transaction: Transaction,
  input: { agentId: string; now: Date; reason: "frequency_change" | "manual" },
) {
  const current = await activeCycle(transaction, input.agentId);
  let startedAt = input.now;
  if (current) {
    if (startedAt <= current.startedAt) {
      startedAt = new Date(current.startedAt.getTime() + 1);
    }
    const [closed] = await transaction
      .update(capCycles)
      .set({ endedAt: startedAt, resetReason: input.reason })
      .where(and(eq(capCycles.id, current.id), isNull(capCycles.endedAt)))
      .returning({ id: capCycles.id });
    if (!closed) throw new Error("The active cap cycle changed");
  }
  const [opened] = await transaction
    .insert(capCycles)
    .values({ agentId: input.agentId, startedAt })
    .returning({ id: capCycles.id, startedAt: capCycles.startedAt });
  if (!opened) throw new Error("PostgreSQL did not return the opened cap cycle");
  return opened;
}

export async function resetCapCycleAtBoundary(
  transaction: Transaction,
  cycle: CurrentCycle,
  input: { agentId: string; now: Date; reason: "frequency_change" | "manual" },
) {
  if (cycle.rolledFromId && cycle.startedAt.getTime() === input.now.getTime()) {
    const [reclassified] = await transaction
      .update(capCycles)
      .set({ resetReason: input.reason })
      .where(eq(capCycles.id, cycle.rolledFromId))
      .returning({ id: capCycles.id });
    if (!reclassified) throw new Error("The rolled cap cycle changed");
    return { id: cycle.id, startedAt: cycle.startedAt };
  }
  return replaceCapCycle(transaction, input);
}

export async function readCurrentCapPolicy(transaction: Transaction, agentId: string, now: Date) {
  const [cap] = await transaction
    .select({
      amountUsdCents: caps.amountUsdCents,
      frequency: caps.frequency,
      updatedAt: caps.updatedAt,
    })
    .from(caps)
    .where(eq(caps.agentId, agentId))
    .for("update");
  if (!cap?.amountUsdCents) return undefined;
  const cycle = await ensureCurrentCapCycle(transaction, {
    agentId,
    frequency: cap.frequency,
    now,
  });
  if (!cycle) throw new LeashCapNotFoundError();
  return {
    amountUsdCents: cap.amountUsdCents,
    cycle,
    frequency: cap.frequency,
    updatedAt: cap.updatedAt,
  };
}
