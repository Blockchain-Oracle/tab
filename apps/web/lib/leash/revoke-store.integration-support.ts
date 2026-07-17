import { randomBytes, randomUUID } from "node:crypto";

import { asc, eq } from "drizzle-orm";

import { generateLeashKey } from "../auth/leash-key";
import { createDatabase } from "../db/client";
import { agentEvents, agents, leashKeys, users } from "../db/schema";

function requiredDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for revocation integration tests");
  return databaseUrl;
}

const databaseUrl = requiredDatabaseUrl();

export type AgentStatus = "provisioned" | "paused" | "frozen" | "cancelled" | "nuked";

export function createRevokeHarness() {
  const connection = createDatabase(databaseUrl, 4);

  async function provision(label: string) {
    const [owner] = await connection.db
      .insert(users)
      .values({
        email: `${label}-${randomUUID()}@example.test`,
        magicIssuer: `did:ethr:${randomUUID()}`,
      })
      .returning({ id: users.id });
    if (!owner) throw new Error("Expected owner");

    const signerSubject = `leash:${randomUUID()}`;
    const agentAddress = `0x${randomBytes(20).toString("hex")}`;
    const [agent] = await connection.db
      .insert(agents)
      .values({
        agentAddress,
        name: `${label} agent`,
        ownerId: owner.id,
        signerSubject,
      })
      .returning({ id: agents.id, name: agents.name });
    if (!agent) throw new Error("Expected agent");

    const historical = generateLeashKey();
    const [historicalKey] = await connection.db
      .insert(leashKeys)
      .values({
        agentId: agent.id,
        hashedKey: historical.hash,
        last4: historical.last4,
        prefix: historical.prefix,
        revokedAt: new Date("2026-07-17T00:00:00.000Z"),
      })
      .returning({ id: leashKeys.id });
    if (!historicalKey) throw new Error("Expected historical key");

    const active = generateLeashKey();
    await connection.db.insert(leashKeys).values({
      agentId: agent.id,
      hashedKey: active.hash,
      last4: active.last4,
      prefix: active.prefix,
      rotatedFromId: historicalKey.id,
    });
    const [history] = await connection.db
      .insert(agentEvents)
      .values({ actorSurface: "agent", agentId: agent.id, type: "connect" })
      .returning({ id: agentEvents.id });
    if (!history) throw new Error("Expected history event");

    return { ...agent, agentAddress, historyId: history.id, ownerId: owner.id, signerSubject };
  }

  async function agentState(agentId: string) {
    const [state] = await connection.db
      .select({
        agent_address: agents.agentAddress,
        credential_destroyed_at: agents.credentialDestroyedAt,
        signer_subject: agents.signerSubject,
        signer_subject_revoked_at: agents.signerSubjectRevokedAt,
        status: agents.status,
      })
      .from(agents)
      .where(eq(agents.id, agentId));
    if (!state) throw new Error("Expected agent state");
    return state;
  }

  function keys(agentId: string) {
    return connection.db
      .select({
        hashedKey: leashKeys.hashedKey,
        id: leashKeys.id,
        revokedAt: leashKeys.revokedAt,
        rotatedFromId: leashKeys.rotatedFromId,
      })
      .from(leashKeys)
      .where(eq(leashKeys.agentId, agentId))
      .orderBy(asc(leashKeys.id));
  }

  function revocations(agentId: string) {
    return connection.db
      .select({ actorSurface: agentEvents.actorSurface, metadata: agentEvents.metadata })
      .from(agentEvents)
      .where(eq(agentEvents.agentId, agentId))
      .orderBy(asc(agentEvents.createdAt), asc(agentEvents.id))
      .then((events) =>
        events
          .filter((event) => "action" in event.metadata)
          .map((event) => ({
            actorSurface: event.actorSurface,
            metadata: {
              action: event.metadata.action,
              fromStatus: event.metadata.fromStatus,
              toStatus: event.metadata.toStatus,
            },
          })),
      );
  }

  return {
    agentState,
    close: () => connection.client.end(),
    connection,
    keys,
    provision,
    reset: () => connection.client`truncate table users cascade`,
    revocations,
  };
}
