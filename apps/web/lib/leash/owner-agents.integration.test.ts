import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import { agents, users } from "../db/schema";
import { LeashAgentSelectionError, readOwnerAgentSelection } from "./owner-agents";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for owner-agent tests");

const connection = createDatabase(databaseUrl, 2);

beforeEach(async () => {
  await connection.client`truncate table users cascade`;
});

afterAll(async () => {
  await connection.client.end();
});

async function owner(label: string) {
  const [row] = await connection.db
    .insert(users)
    .values({
      email: `${label}-${randomUUID()}@example.test`,
      magicIssuer: `did:ethr:${randomUUID()}`,
    })
    .returning({ id: users.id });
  if (!row) throw new Error("Expected owner");
  return row;
}

async function agent(ownerId: string, name: string, createdAt: Date) {
  const [row] = await connection.db
    .insert(agents)
    .values({ createdAt, name, ownerId, signerSubject: `leash:${randomUUID()}` })
    .returning({ id: agents.id });
  if (!row) throw new Error("Expected agent");
  return row;
}

describe("owner agent selection with real PostgreSQL", () => {
  it("returns an honest empty selection when an owner has no provisioned agent", async () => {
    const first = await owner("empty");
    await expect(readOwnerAgentSelection(connection.db, { ownerId: first.id })).resolves.toEqual({
      agents: [],
      selected: null,
    });
  });

  it("selects the newest owned agent by default and an exact requested agent", async () => {
    const first = await owner("owned");
    const older = await agent(first.id, "Older worker", new Date("2026-07-15T00:00:00Z"));
    const newer = await agent(first.id, "Newer worker", new Date("2026-07-16T00:00:00Z"));

    const defaultSelection = await readOwnerAgentSelection(connection.db, { ownerId: first.id });
    expect(defaultSelection.agents.map((item) => item.id)).toEqual([newer.id, older.id]);
    expect(defaultSelection.selected?.id).toBe(newer.id);

    const requested = await readOwnerAgentSelection(connection.db, {
      agentId: older.id,
      ownerId: first.id,
    });
    expect(requested.selected?.id).toBe(older.id);
  });

  it("uses one selection error for malformed, missing, and foreign agent ids", async () => {
    const first = await owner("first");
    const second = await owner("second");
    const foreign = await agent(second.id, "Foreign worker", new Date());

    for (const agentId of ["not-a-uuid", randomUUID(), foreign.id]) {
      await expect(
        readOwnerAgentSelection(connection.db, { agentId, ownerId: first.id }),
      ).rejects.toBeInstanceOf(LeashAgentSelectionError);
    }
  });
});
