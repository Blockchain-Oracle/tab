import { desc, eq } from "drizzle-orm";

import type { Database } from "../db/client";
import { agents } from "../db/schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class LeashAgentSelectionError extends Error {
  constructor() {
    super("The Leash agent was not found.");
    this.name = "LeashAgentSelectionError";
  }
}

const ownerAgent = {
  agentAddress: agents.agentAddress,
  clientName: agents.clientName,
  clientVersion: agents.clientVersion,
  connectionCount: agents.connectionCount,
  createdAt: agents.createdAt,
  firstSeenAt: agents.firstSeenAt,
  id: agents.id,
  lastSeenAt: agents.lastSeenAt,
  name: agents.name,
  status: agents.status,
  transport: agents.transport,
};

export async function readOwnerAgentSelection(
  database: Database,
  options: { agentId?: string; ownerId: string },
) {
  if (options.agentId && !UUID.test(options.agentId)) {
    throw new LeashAgentSelectionError();
  }

  const rows = await database
    .select(ownerAgent)
    .from(agents)
    .where(eq(agents.ownerId, options.ownerId))
    .orderBy(desc(agents.createdAt), desc(agents.id));

  if (!options.agentId) return { agents: rows, selected: rows[0] ?? null };
  const selected = rows.find((row) => row.id === options.agentId);
  if (!selected) throw new LeashAgentSelectionError();
  return { agents: rows, selected };
}

export type OwnerAgent = NonNullable<
  Awaited<ReturnType<typeof readOwnerAgentSelection>>["selected"]
>;
