import { and, eq } from "drizzle-orm";

import type { Database } from "../db/client";
import { agents, caps } from "../db/schema";
import {
  readCurrentCapPolicy,
  replaceCapCycle,
  resetCapCycleAtBoundary,
} from "./cap-cycle-policy-store";
import { LeashAgentNotFoundError, LeashCapNotFoundError } from "./cap-policy-errors";
import { capPolicySummary } from "./cap-policy-summary";
import type { CapFrequency } from "./cycles";
import { emitCapLoweredHalt, resolveActiveCapHalt } from "./notifier";

const ATOMIC_UNITS_PER_CENT = BigInt(10_000);
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type OwnerAgent = { agentId: string; ownerId: string };
type TimedOwnerAgent = OwnerAgent & { now?: Date };
type CapMutation = TimedOwnerAgent & {
  amountUsdCents: string;
  frequency: CapFrequency;
};

export { LeashAgentNotFoundError, LeashCapNotFoundError } from "./cap-policy-errors";

function validNow(now: Date | undefined) {
  const value = now ?? new Date();
  if (!Number.isFinite(value.getTime())) throw new Error("The cap timestamp is invalid");
  return value;
}

function validAmount(value: string) {
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error("The cap amount is invalid");
  return BigInt(value);
}

async function lockOwnedAgent(transaction: Transaction, input: OwnerAgent) {
  const [agent] = await transaction
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, input.agentId), eq(agents.ownerId, input.ownerId)))
    .for("update");
  if (!agent) throw new LeashAgentNotFoundError();
  return agent;
}

export async function readOwnerCap(db: Database, input: TimedOwnerAgent) {
  const now = validNow(input.now);
  return db.transaction(async (transaction) => {
    await lockOwnedAgent(transaction, input);
    const policy = await readCurrentCapPolicy(transaction, input.agentId, now);
    if (!policy) return null;
    return capPolicySummary(transaction, { agentId: input.agentId, ...policy });
  });
}

export async function setOwnerCap(db: Database, input: CapMutation) {
  const amount = validAmount(input.amountUsdCents);
  const now = validNow(input.now);
  return db.transaction(async (transaction) => {
    await lockOwnedAgent(transaction, input);
    const previous = await readCurrentCapPolicy(transaction, input.agentId, now);
    const frequencyChanged = previous !== undefined && previous.frequency !== input.frequency;
    const cycle =
      previous && !frequencyChanged
        ? previous.cycle
        : previous
          ? await resetCapCycleAtBoundary(transaction, previous.cycle, {
              agentId: input.agentId,
              now,
              reason: "frequency_change",
            })
          : await replaceCapCycle(transaction, {
              agentId: input.agentId,
              now,
              reason: "frequency_change",
            });
    const [stored] = await transaction
      .insert(caps)
      .values({
        agentId: input.agentId,
        amountUsdCents: amount.toString(),
        frequency: input.frequency,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        set: { amountUsdCents: amount.toString(), frequency: input.frequency, updatedAt: now },
        target: caps.agentId,
      })
      .returning({
        amountUsdCents: caps.amountUsdCents,
        frequency: caps.frequency,
        updatedAt: caps.updatedAt,
      });
    if (!stored?.amountUsdCents) throw new Error("PostgreSQL did not return the stored cap");
    const resultBeforeRemediation = await capPolicySummary(transaction, {
      agentId: input.agentId,
      amountUsdCents: stored.amountUsdCents,
      cycle,
      frequency: stored.frequency,
      updatedAt: stored.updatedAt,
    });
    const capAtomic = (amount * ATOMIC_UNITS_PER_CENT).toString();
    const committedAtomic = resultBeforeRemediation.spend.committedAtomic;
    const loweredWithinCycle =
      previous !== undefined && !frequencyChanged && amount < BigInt(previous.amountUsdCents);
    const raisedWithinCycle =
      previous !== undefined && !frequencyChanged && amount > BigInt(previous.amountUsdCents);
    if (loweredWithinCycle && BigInt(committedAtomic) > BigInt(capAtomic)) {
      await emitCapLoweredHalt(transaction, {
        agentId: input.agentId,
        capAtomic,
        committedAtomic,
        cycleId: cycle.id,
        now,
      });
    } else if (
      (frequencyChanged || raisedWithinCycle) &&
      BigInt(committedAtomic) < BigInt(capAtomic)
    ) {
      await resolveActiveCapHalt(transaction, { agentId: input.agentId, now });
    }
    return capPolicySummary(transaction, {
      agentId: input.agentId,
      amountUsdCents: stored.amountUsdCents,
      cycle,
      frequency: stored.frequency,
      updatedAt: stored.updatedAt,
    });
  });
}

export async function resetOwnerCapCycle(db: Database, input: TimedOwnerAgent) {
  const now = validNow(input.now);
  return db.transaction(async (transaction) => {
    await lockOwnedAgent(transaction, input);
    const policy = await readCurrentCapPolicy(transaction, input.agentId, now);
    if (!policy) throw new LeashCapNotFoundError();
    const cycle = await resetCapCycleAtBoundary(transaction, policy.cycle, {
      agentId: input.agentId,
      now,
      reason: "manual",
    });
    await resolveActiveCapHalt(transaction, { agentId: input.agentId, now });
    return capPolicySummary(transaction, {
      agentId: input.agentId,
      amountUsdCents: policy.amountUsdCents,
      cycle,
      frequency: policy.frequency,
      updatedAt: policy.updatedAt,
    });
  });
}
