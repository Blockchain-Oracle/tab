import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { issueLeashKey } from "../../../../lib/auth/leash-key";
import { createDatabase } from "../../../../lib/db/client";
import { agentEvents, agents, users } from "../../../../lib/db/schema";
import { closeServerDatabase } from "../../../../lib/db/server";

const databaseUrl = process.env.DATABASE_URL;
const appOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost").origin;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for agent connect integration tests");
}

export const connection = createDatabase(databaseUrl, 4);
type AgentStatus = "provisioned" | "paused" | "frozen" | "cancelled" | "nuked";

export function request(body: unknown, secret?: string) {
  return new NextRequest(`${appOrigin}/api/agent/connect`, {
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: {
      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      "content-type": "application/json",
    },
    method: "POST",
  });
}

export async function provisionAgent(
  label: string,
  status: AgentStatus = "provisioned",
  paymentProfile: "mainnet" | "base_sepolia_integration" = "mainnet",
) {
  const [user] = await connection.db
    .insert(users)
    .values({
      email: `${label}-${randomUUID()}@example.test`,
      magicIssuer: `did:ethr:${randomUUID()}`,
    })
    .returning({ id: users.id });
  if (!user) throw new Error("PostgreSQL did not return the Leash owner");

  const [agent] = await connection.db
    .insert(agents)
    .values({
      name: `${label} agent`,
      ownerId: user.id,
      paymentProfile,
      signerSubject: `leash:${randomUUID()}`,
      status,
    })
    .returning({ id: agents.id });
  if (!agent) throw new Error("PostgreSQL did not return the Leash agent");

  const key = await issueLeashKey(connection.db, { agentId: agent.id });
  return { agentId: agent.id, keyId: key.key.id, ownerId: user.id, secret: key.secret };
}

export async function agentRow(agentId: string) {
  const [row] = await connection.db.select().from(agents).where(eq(agents.id, agentId));
  return row;
}

export function eventsFor(agentId: string) {
  return connection.db.select().from(agentEvents).where(eq(agentEvents.agentId, agentId));
}

export async function resetConnectDatabase() {
  await connection.client`truncate table users cascade`;
}

export async function closeConnectDatabase() {
  await closeServerDatabase();
  await connection.client.end();
}
