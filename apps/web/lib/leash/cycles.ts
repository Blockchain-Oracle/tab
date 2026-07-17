import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import type { Database } from "../db/client";
import { capCycles } from "../db/schema";
import { resolveActiveCapHalt } from "./notifier";

const DAY_MS = 24 * 60 * 60 * 1_000;
const WEEK_MS = 7 * DAY_MS;

export type CapFrequency = "daily" | "weekly" | "monthly" | "never";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function monthlyBoundary(anchor: Date, offset: number) {
  const month = anchor.getUTCMonth() + offset;
  const year = anchor.getUTCFullYear() + Math.floor(month / 12);
  const monthInYear = ((month % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, monthInYear + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthInYear, Math.min(anchor.getUTCDate(), lastDay), 0, 0, 0, 0));
}

function utcMidnight(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function fixedWindow(anchor: Date, now: Date, durationMs: number) {
  const offset = Math.max(0, Math.floor((now.getTime() - anchor.getTime()) / durationMs));
  return {
    nextResetAt: new Date(anchor.getTime() + (offset + 1) * durationMs),
    startedAt: new Date(anchor.getTime() + offset * durationMs),
  };
}

function monthlyWindow(anchor: Date, now: Date) {
  let offset = Math.max(
    0,
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
      now.getUTCMonth() -
      anchor.getUTCMonth(),
  );
  while (offset > 0 && monthlyBoundary(anchor, offset) > now) offset -= 1;
  while (monthlyBoundary(anchor, offset + 1) <= now) offset += 1;
  return {
    nextResetAt: monthlyBoundary(anchor, offset + 1),
    startedAt: monthlyBoundary(anchor, offset),
  };
}

export function deriveCycleWindow(anchor: Date, frequency: CapFrequency, now: Date) {
  if (!Number.isFinite(anchor.getTime()) || !Number.isFinite(now.getTime())) {
    throw new Error("Cycle timestamps must be valid dates");
  }
  if (frequency === "never") {
    return { nextResetAt: null, startedAt: new Date(anchor) };
  }
  const normalizedAnchor = utcMidnight(anchor);
  if (frequency === "monthly") return monthlyWindow(normalizedAnchor, now);
  return fixedWindow(normalizedAnchor, now, frequency === "daily" ? DAY_MS : WEEK_MS);
}

async function scheduleAnchor(transaction: Transaction, agentId: string) {
  const [latestManualBoundary] = await transaction
    .select({ anchor: capCycles.endedAt })
    .from(capCycles)
    .where(
      and(
        eq(capCycles.agentId, agentId),
        inArray(capCycles.resetReason, ["manual", "frequency_change"]),
      ),
    )
    .orderBy(desc(capCycles.endedAt))
    .limit(1);
  if (latestManualBoundary?.anchor) return latestManualBoundary.anchor;

  const [first] = await transaction
    .select({ anchor: capCycles.startedAt })
    .from(capCycles)
    .where(eq(capCycles.agentId, agentId))
    .orderBy(asc(capCycles.startedAt))
    .limit(1);
  return first?.anchor;
}

export async function ensureCurrentCapCycle(
  transaction: Transaction,
  options: { agentId: string; frequency: CapFrequency; now: Date },
) {
  const [active] = await transaction
    .select({ id: capCycles.id, startedAt: capCycles.startedAt })
    .from(capCycles)
    .where(and(eq(capCycles.agentId, options.agentId), isNull(capCycles.endedAt)))
    .for("update");
  if (!active) return undefined;

  const anchor = (await scheduleAnchor(transaction, options.agentId)) ?? active.startedAt;
  const window = deriveCycleWindow(anchor, options.frequency, options.now);
  if (window.startedAt <= active.startedAt) {
    return { ...active, nextResetAt: window.nextResetAt, rolledFromId: null };
  }
  const activeWindow = deriveCycleWindow(anchor, options.frequency, active.startedAt);
  if (!activeWindow.nextResetAt) {
    return { ...active, nextResetAt: null, rolledFromId: null };
  }

  const [closed] = await transaction
    .update(capCycles)
    .set({ endedAt: activeWindow.nextResetAt, resetReason: "schedule" })
    .where(and(eq(capCycles.id, active.id), isNull(capCycles.endedAt)))
    .returning({ id: capCycles.id });
  if (!closed) throw new Error("The active cap cycle changed during rollover");
  const [opened] = await transaction
    .insert(capCycles)
    .values({ agentId: options.agentId, startedAt: window.startedAt })
    .returning({ id: capCycles.id, startedAt: capCycles.startedAt });
  if (!opened) throw new Error("PostgreSQL did not return the scheduled cap cycle");
  await resolveActiveCapHalt(transaction, { agentId: options.agentId, now: options.now });
  return {
    ...opened,
    nextResetAt: window.nextResetAt,
    rolledFromId: active.id,
  };
}
