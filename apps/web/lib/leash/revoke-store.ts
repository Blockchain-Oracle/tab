import { and, eq, sql } from "drizzle-orm";

import { LeashAgentNotFoundError } from "../auth/leash-key";
import type { Database } from "../db/client";
import { agentEvents, agents, leashKeys } from "../db/schema";
import type { RevokeAction } from "./revoke-input";

type AgentStatus = typeof agents.$inferSelect.status;
type ActorSurface = typeof agentEvents.$inferInsert.actorSurface;

export class InvalidAgentTransitionError extends Error {
  constructor() {
    super("The requested revocation transition is not available for this agent.");
    this.name = "InvalidAgentTransitionError";
  }
}

export class InvalidCancelConfirmationError extends Error {
  constructor() {
    super("Type CANCEL exactly to cancel this credential.");
    this.name = "InvalidCancelConfirmationError";
  }
}

export class InvalidNuclearConfirmationError extends Error {
  constructor() {
    super("Type the current agent name exactly to destroy this credential.");
    this.name = "InvalidNuclearConfirmationError";
  }
}

function targetStatus(status: AgentStatus, action: RevokeAction): AgentStatus | undefined {
  if (action === "pause") {
    if (status === "paused") return status;
    return status === "provisioned" ? "paused" : undefined;
  }
  if (action === "resume") {
    if (status === "provisioned") return status;
    return status === "paused" ? "provisioned" : undefined;
  }
  if (action === "freeze") {
    if (status === "frozen") return status;
    return status === "provisioned" || status === "paused" ? "frozen" : undefined;
  }
  if (action === "unfreeze") {
    if (status === "provisioned") return status;
    return status === "frozen" ? "provisioned" : undefined;
  }
  if (action === "cancel") {
    if (status === "cancelled") return status;
    return status === "nuked" ? undefined : "cancelled";
  }
  return "nuked";
}

async function reconcileTerminalKeys(
  transaction: Parameters<Parameters<Database["transaction"]>[0]>[0],
  agentId: string,
  status: "cancelled" | "nuked",
) {
  if (status === "nuked") {
    await transaction.delete(leashKeys).where(eq(leashKeys.agentId, agentId));
    return;
  }
  await transaction
    .update(leashKeys)
    .set({ revokedAt: sql`coalesce(${leashKeys.revokedAt}, statement_timestamp())` })
    .where(eq(leashKeys.agentId, agentId));
}

export async function revokeOwnerAgent(
  database: Database,
  input: {
    action: RevokeAction;
    actorSurface: ActorSurface;
    agentId: string;
    confirmation?: string;
    ownerId: string;
  },
) {
  return database.transaction(async (transaction) => {
    const [agent] = await transaction
      .select({ id: agents.id, name: agents.name, status: agents.status })
      .from(agents)
      .where(and(eq(agents.id, input.agentId), eq(agents.ownerId, input.ownerId)))
      .for("update");
    if (!agent) throw new LeashAgentNotFoundError();

    if (input.action === "cancel" && input.confirmation !== "CANCEL") {
      throw new InvalidCancelConfirmationError();
    }
    if (input.action === "nuclear" && input.confirmation !== agent.name) {
      throw new InvalidNuclearConfirmationError();
    }

    const nextStatus = targetStatus(agent.status, input.action);
    if (!nextStatus) throw new InvalidAgentTransitionError();
    if (nextStatus === agent.status) {
      if (nextStatus === "cancelled" || nextStatus === "nuked") {
        await reconcileTerminalKeys(transaction, agent.id, nextStatus);
      }
      return { agentId: agent.id, changed: false, status: agent.status };
    }

    if (nextStatus === "cancelled" || nextStatus === "nuked") {
      await reconcileTerminalKeys(transaction, agent.id, nextStatus);
    }
    const lifecycle =
      nextStatus === "cancelled"
        ? {
            credentialDestroyedAt: null,
            signerSubject: null,
            signerSubjectRevokedAt: sql`statement_timestamp()`,
          }
        : nextStatus === "nuked"
          ? {
              credentialDestroyedAt: sql`greatest(
                coalesce(${agents.signerSubjectRevokedAt}, statement_timestamp()),
                statement_timestamp()
              )`,
              signerSubject: null,
              signerSubjectRevokedAt: sql`coalesce(
                ${agents.signerSubjectRevokedAt}, statement_timestamp()
              )`,
            }
          : {};
    const [updated] = await transaction
      .update(agents)
      .set({ ...lifecycle, status: nextStatus })
      .where(eq(agents.id, agent.id))
      .returning({ id: agents.id });
    if (!updated) throw new Error("PostgreSQL did not update the Leash agent state");

    const [event] = await transaction
      .insert(agentEvents)
      .values({
        actorSurface: input.actorSurface,
        agentId: agent.id,
        metadata: { action: input.action, fromStatus: agent.status, toStatus: nextStatus },
        type: "revoke",
      })
      .returning({ id: agentEvents.id });
    if (!event) throw new Error("PostgreSQL did not return the revocation event");
    return { agentId: agent.id, changed: true, status: nextStatus };
  });
}
