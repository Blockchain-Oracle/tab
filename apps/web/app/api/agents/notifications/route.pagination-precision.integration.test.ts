import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createSessionToken, SESSION_COOKIE_NAME } from "../../../../lib/auth/session";
import { createDatabase } from "../../../../lib/db/client";
import { agents, capCycles, users } from "../../../../lib/db/schema";
import { GET } from "./route";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for notification route tests");

const connection = createDatabase(databaseUrl, 1);
const appOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost").origin;

beforeEach(async () => {
  await connection.client`truncate table users cascade`;
});

afterAll(async () => {
  await connection.client.end();
});

async function provision() {
  const email = `precision-${randomUUID()}@example.test`;
  const [owner] = await connection.db
    .insert(users)
    .values({ email, magicIssuer: `did:ethr:${randomUUID()}` })
    .returning({ id: users.id });
  if (!owner) throw new Error("Expected owner");
  const [agent] = await connection.db
    .insert(agents)
    .values({ ownerId: owner.id, name: "Precision agent", signerSubject: `leash:${randomUUID()}` })
    .returning({ id: agents.id });
  if (!agent) throw new Error("Expected agent");
  const [cycle] = await connection.db
    .insert(capCycles)
    .values({ agentId: agent.id, startedAt: new Date("2026-07-17T09:00:00.000Z") })
    .returning({ id: capCycles.id });
  if (!cycle) throw new Error("Expected cycle");
  const token = await createSessionToken({ email, userId: owner.id });
  return { agentId: agent.id, cycleId: cycle.id, token };
}

async function insertAt(agentId: string, cycleId: string, id: string, createdAtLiteral: string) {
  await connection.client`
    insert into notifications (
      id, agent_id, cycle_id, tier, type, event_key, metadata, sticky, created_at
    ) values (
      ${id}, ${agentId}, ${cycleId}, '2', 'float_low', ${`precision:${id}`}, '{}', false,
      ${createdAtLiteral}::timestamptz
    )
  `;
}

function request(agentId: string, token: string, cursor?: string) {
  const url = new URL(`/api/agents/notifications?agentId=${agentId}&limit=2`, appOrigin);
  if (cursor) url.searchParams.set("cursor", cursor);
  return new NextRequest(url, {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    method: "GET",
  });
}

describe("notification keyset timestamp precision", () => {
  it("normalizes sub-millisecond inserts so page cursors cannot skip rows", async () => {
    const owner = await provision();
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    const literals = [
      "2026-07-17T12:00:00.000900Z",
      "2026-07-17T12:00:00.000800Z",
      "2026-07-17T12:00:00.000700Z",
    ];
    for (const [index, id] of ids.entries()) {
      if (!id) throw new Error("Expected notification id");
      await insertAt(owner.agentId, owner.cycleId, id, literals[index] ?? "");
    }

    const first = await GET(request(owner.agentId, owner.token));
    const firstBody = await first.json();
    expect(firstBody.notifications).toHaveLength(2);
    expect(firstBody.nextCursor).toEqual(expect.any(String));

    const second = await GET(request(owner.agentId, owner.token, firstBody.nextCursor));
    const secondBody = await second.json();
    const pagedIds = [...firstBody.notifications, ...secondBody.notifications].map(
      (notification: { id: string }) => notification.id,
    );
    expect(new Set(pagedIds)).toEqual(new Set(ids));
    expect(pagedIds).toHaveLength(ids.length);
    expect(secondBody.nextCursor).toBeNull();

    const stored = await connection.client<{ created_at: string }[]>`
      select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') as created_at
      from notifications
      where agent_id = ${owner.agentId}
      order by created_at desc, id desc
    `;
    expect(stored.map((row) => row.created_at)).toEqual([
      "2026-07-17 12:00:00.001000",
      "2026-07-17 12:00:00.001000",
      "2026-07-17 12:00:00.001000",
    ]);
  });
});
