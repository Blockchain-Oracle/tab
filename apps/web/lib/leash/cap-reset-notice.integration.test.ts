import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import { agents, capCycles, users } from "../db/schema";
import { readOwnerCapResetNotice } from "./cap-reset-notice";
import { ensureCurrentCapCycle } from "./cycles";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for cap reset notice tests");
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
    .values({ ownerId: owner.id, name: `${label} agent`, signerSubject: `leash:${randomUUID()}` })
    .returning({ id: agents.id });
  if (!agent) throw new Error("Expected agent");
  return { agentId: agent.id, ownerId: owner.id };
}

const resetAt = new Date("2026-07-17T10:00:00.000Z");

async function insertTransition(
  identity: Awaited<ReturnType<typeof provision>>,
  reason: "frequency_change" | "manual" | "schedule",
) {
  await connection.db.insert(capCycles).values([
    {
      agentId: identity.agentId,
      endedAt: resetAt,
      resetReason: reason,
      startedAt: new Date("2026-07-17T09:00:00.000Z"),
    },
    { agentId: identity.agentId, startedAt: resetAt },
  ]);
}

describe("owner cap reset notice with real PostgreSQL", () => {
  it.each([
    "schedule",
    "manual",
    "frequency_change",
  ] as const)("projects a real %s transition into the current cycle", async (reason) => {
    const identity = await provision(reason);
    await insertTransition(identity, reason);

    await expect(readOwnerCapResetNotice(connection.db, identity)).resolves.toEqual({
      reason,
      resetAt: resetAt.toISOString(),
    });
  });

  it("projects the current boundary after several scheduled periods were missed", async () => {
    const identity = await provision("missed-schedule");
    await connection.db.insert(capCycles).values({
      agentId: identity.agentId,
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    await connection.db.transaction((transaction) =>
      ensureCurrentCapCycle(transaction, {
        agentId: identity.agentId,
        frequency: "daily",
        now: new Date("2026-04-15T12:00:00.000Z"),
      }),
    );

    await expect(readOwnerCapResetNotice(connection.db, identity)).resolves.toEqual({
      reason: "schedule",
      resetAt: "2026-04-15T00:00:00.000Z",
    });
  });

  it("renders no event for a first-ever cycle or a non-adjacent historical reset", async () => {
    const first = await provision("first");
    await connection.db.insert(capCycles).values({ agentId: first.agentId, startedAt: resetAt });

    await expect(readOwnerCapResetNotice(connection.db, first)).resolves.toBeNull();

    const gap = await provision("gap");
    await connection.db.insert(capCycles).values([
      {
        agentId: gap.agentId,
        endedAt: new Date("2026-07-17T09:30:00.000Z"),
        resetReason: "manual",
        startedAt: new Date("2026-07-17T09:00:00.000Z"),
      },
      { agentId: gap.agentId, startedAt: resetAt },
    ]);

    await expect(readOwnerCapResetNotice(connection.db, gap)).resolves.toBeNull();
  });

  it("does not expose another owner's current-cycle transition", async () => {
    const owner = await provision("owner");
    const foreign = await provision("foreign");
    await insertTransition(owner, "manual");

    await expect(
      readOwnerCapResetNotice(connection.db, {
        agentId: owner.agentId,
        ownerId: foreign.ownerId,
      }),
    ).resolves.toBeNull();
  });
});
