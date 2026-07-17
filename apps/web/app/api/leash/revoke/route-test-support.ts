import { randomUUID } from "node:crypto";

import { asc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { createSessionToken, SESSION_COOKIE_NAME } from "../../../../lib/auth/session";
import { createDatabase } from "../../../../lib/db/client";
import { agentEvents, agents, users } from "../../../../lib/db/schema";
import { closeServerDatabase } from "../../../../lib/db/server";

export function createRevokeRouteHarness(databaseUrl: string) {
  const connection = createDatabase(databaseUrl, 2);
  const appOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost").origin;

  async function provision(label: string) {
    const email = `${label}-${randomUUID()}@example.test`;
    const [owner] = await connection.db
      .insert(users)
      .values({ email, magicIssuer: `did:ethr:${randomUUID()}` })
      .returning({ id: users.id });
    if (!owner) throw new Error("Expected owner");
    const name = `${label} agent`;
    const [agent] = await connection.db
      .insert(agents)
      .values({ name, ownerId: owner.id, signerSubject: `leash:${randomUUID()}` })
      .returning({ id: agents.id });
    if (!agent) throw new Error("Expected agent");
    return {
      agentId: agent.id,
      name,
      ownerId: owner.id,
      token: await createSessionToken({ email, userId: owner.id }),
    };
  }

  function request(body: unknown, token?: string, origin = appOrigin, raw = false) {
    return new NextRequest(new URL("/api/leash/revoke", appOrigin), {
      body: raw ? String(body) : JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        origin,
        ...(token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
      },
      method: "POST",
    });
  }

  async function status(agentId: string) {
    const [row] = await connection.db
      .select({ status: agents.status })
      .from(agents)
      .where(eq(agents.id, agentId));
    return row?.status;
  }

  function revocations(agentId: string) {
    return connection.db
      .select({ actorSurface: agentEvents.actorSurface, metadata: agentEvents.metadata })
      .from(agentEvents)
      .where(eq(agentEvents.agentId, agentId))
      .orderBy(asc(agentEvents.createdAt), asc(agentEvents.id));
  }

  return {
    close: async () => {
      await closeServerDatabase();
      await connection.client.end();
    },
    connection,
    provision,
    request,
    reset: () => connection.client`truncate table users cascade`,
    revocations,
    status,
  };
}
