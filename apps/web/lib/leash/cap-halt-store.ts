import { and, eq, inArray, isNull } from "drizzle-orm";

import type { Database } from "../db/client";
import { notifications } from "../db/schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function findActiveCapHalt(transaction: Transaction, agentId: string) {
  const [halt] = await transaction
    .select({ id: notifications.id, type: notifications.type })
    .from(notifications)
    .where(
      and(
        eq(notifications.agentId, agentId),
        isNull(notifications.resolvedAt),
        inArray(notifications.type, ["cap_blocked", "cap_lowered_halt"]),
      ),
    )
    .limit(1);
  return halt;
}
