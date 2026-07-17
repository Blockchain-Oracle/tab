import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import { agents, capCycles, notifications, users } from "../db/schema";
import { countOwnerUnreadNotifications } from "./notification-store";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for owner notification count tests");

const connection = createDatabase(databaseUrl, 2);

beforeEach(async () => {
  await connection.client`truncate table users cascade`;
});

afterAll(async () => {
  await connection.client.end();
});

async function provision(label: string) {
  const [owner] = await connection.db
    .insert(users)
    .values({
      email: `${label}-${randomUUID()}@example.test`,
      magicIssuer: `did:ethr:${randomUUID()}`,
    })
    .returning({ id: users.id });
  if (!owner) throw new Error("Expected owner");
  const [agent] = await connection.db
    .insert(agents)
    .values({ name: `${label} agent`, ownerId: owner.id, signerSubject: `leash:${randomUUID()}` })
    .returning({ id: agents.id });
  if (!agent) throw new Error("Expected agent");
  const [cycle] = await connection.db
    .insert(capCycles)
    .values({ agentId: agent.id, startedAt: new Date("2026-07-17T00:00:00Z") })
    .returning({ id: capCycles.id });
  if (!cycle) throw new Error("Expected cycle");
  return { agentId: agent.id, cycleId: cycle.id, ownerId: owner.id };
}

describe("owner-wide unread notification badge", () => {
  it("counts only unread T2/T3 rows belonging to the exact owner", async () => {
    const first = await provision("first");
    const second = await provision("second");
    const createdAt = new Date("2026-07-17T00:00:00Z");
    await connection.db.insert(notifications).values([
      {
        agentId: first.agentId,
        createdAt,
        cycleId: first.cycleId,
        eventKey: `cap_75:${first.cycleId}`,
        tier: "2",
        type: "cap_75",
      },
      {
        agentId: first.agentId,
        createdAt,
        cycleId: first.cycleId,
        eventKey: `float_empty:${first.cycleId}:eip155:8453`,
        tier: "2",
        type: "float_empty",
      },
      {
        agentId: first.agentId,
        createdAt,
        cycleId: first.cycleId,
        eventKey: `float_low:${first.cycleId}:eip155:8453`,
        readAt: new Date("2026-07-17T01:00:00Z"),
        tier: "2",
        type: "float_low",
      },
      {
        agentId: second.agentId,
        createdAt,
        cycleId: second.cycleId,
        eventKey: `cap_75:${second.cycleId}`,
        tier: "2",
        type: "cap_75",
      },
    ]);

    await expect(
      countOwnerUnreadNotifications(connection.db, { ownerId: first.ownerId }),
    ).resolves.toBe(2);
    await expect(
      countOwnerUnreadNotifications(connection.db, { ownerId: second.ownerId }),
    ).resolves.toBe(1);
  });
});
