import { and, desc, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Database } from "../db/client";
import { agents, capCycles } from "../db/schema";

export type CapResetNotice = {
  reason: "frequency_change" | "manual" | "schedule";
  resetAt: string;
};

export async function readOwnerCapResetNotice(
  database: Database,
  input: { agentId: string; ownerId: string },
): Promise<CapResetNotice | null> {
  const current = alias(capCycles, "current_cap_cycle");
  const previous = alias(capCycles, "previous_cap_cycle");
  const [transition] = await database
    .select({ endedAt: previous.endedAt, reason: previous.resetReason, resetAt: current.startedAt })
    .from(current)
    .innerJoin(agents, eq(agents.id, current.agentId))
    .innerJoin(
      previous,
      and(
        eq(previous.agentId, current.agentId),
        lt(previous.startedAt, current.startedAt),
        isNotNull(previous.endedAt),
        isNotNull(previous.resetReason),
      ),
    )
    .where(
      and(
        eq(current.agentId, input.agentId),
        eq(agents.ownerId, input.ownerId),
        isNull(current.endedAt),
      ),
    )
    .orderBy(desc(previous.startedAt))
    .limit(1);

  if (!transition?.reason || !transition.endedAt) return null;
  const adjacent = transition.endedAt.getTime() === transition.resetAt.getTime();
  const missedSchedule =
    transition.reason === "schedule" && transition.endedAt < transition.resetAt;
  if (!adjacent && !missedSchedule) return null;
  return { reason: transition.reason, resetAt: transition.resetAt.toISOString() };
}
