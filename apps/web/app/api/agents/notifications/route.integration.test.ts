import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createSessionToken, SESSION_COOKIE_NAME } from "../../../../lib/auth/session";
import { createDatabase } from "../../../../lib/db/client";
import { agents, capCycles, notifications, users } from "../../../../lib/db/schema";
import { GET, PATCH } from "./route";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for notification route tests");

const connection = createDatabase(databaseUrl, 2);
const appOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost").origin;

beforeEach(async () => {
  await connection.client`truncate table users cascade`;
});

afterAll(async () => {
  await connection.client.end();
});

async function provision(label: string) {
  const email = `${label}-${randomUUID()}@example.test`;
  const [owner] = await connection.db
    .insert(users)
    .values({ email, magicIssuer: `did:ethr:${randomUUID()}` })
    .returning({ id: users.id });
  if (!owner) throw new Error("Expected owner");
  const [agent] = await connection.db
    .insert(agents)
    .values({ ownerId: owner.id, name: `${label} agent`, signerSubject: `leash:${randomUUID()}` })
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

interface SeedNotification {
  createdAt: Date;
  readAt?: Date;
  resolvedAt?: Date;
  tier: "2" | "3";
  type: typeof notifications.$inferInsert.type;
}

async function seed(agentId: string, cycleId: string, input: SeedNotification) {
  const [row] = await connection.db
    .insert(notifications)
    .values({
      agentId,
      createdAt: input.createdAt,
      cycleId,
      eventKey: `route-test:${randomUUID()}`,
      metadata: { source: "real-route-test" },
      ...(input.readAt ? { readAt: input.readAt } : {}),
      ...(input.resolvedAt ? { resolvedAt: input.resolvedAt } : {}),
      sticky: input.tier === "3",
      tier: input.tier,
      type: input.type,
    })
    .returning({ id: notifications.id });
  if (!row) throw new Error("Expected notification");
  return row.id;
}

function request(
  method: "GET" | "PATCH",
  path: string,
  token?: string,
  body?: unknown,
  origin = appOrigin,
) {
  return new NextRequest(new URL(path, appOrigin), {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json", origin }),
      ...(token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
    },
    method,
  });
}

describe("owner notification API", () => {
  it("requires an owner session, strict filters, and same-origin mutations", async () => {
    const owner = await provision("auth");
    const unauthorized = await GET(
      request("GET", `/api/agents/notifications?agentId=${owner.agentId}`),
    );
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("cache-control")).toBe("no-store");

    const malformed = await GET(
      request(
        "GET",
        `/api/agents/notifications?agentId=${owner.agentId}&tier=1&surprise=true`,
        owner.token,
      ),
    );
    expect(malformed.status).toBe(400);

    const crossOrigin = await PATCH(
      request(
        "PATCH",
        "/api/agents/notifications",
        owner.token,
        { action: "read_all", agentId: owner.agentId },
        "https://attacker.example.test",
      ),
    );
    expect(crossOrigin.status).toBe(403);
  });

  it("lists newest-first, exposes durable state and CTA, and filters without changing badge", async () => {
    const owner = await provision("list");
    await seed(owner.agentId, owner.cycleId, {
      createdAt: new Date("2026-07-17T10:00:00.000Z"),
      readAt: new Date("2026-07-17T10:01:00.000Z"),
      tier: "2",
      type: "cap_75",
    });
    await seed(owner.agentId, owner.cycleId, {
      createdAt: new Date("2026-07-17T11:00:00.000Z"),
      resolvedAt: new Date("2026-07-17T11:30:00.000Z"),
      tier: "3",
      type: "cap_lowered_halt",
    });
    await seed(owner.agentId, owner.cycleId, {
      createdAt: new Date("2026-07-17T12:00:00.000Z"),
      tier: "2",
      type: "float_low",
    });
    await seed(owner.agentId, owner.cycleId, {
      createdAt: new Date("2026-07-17T13:00:00.000Z"),
      tier: "3",
      type: "cap_blocked",
    });

    const response = await GET(
      request("GET", `/api/agents/notifications?agentId=${owner.agentId}`, owner.token),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.unreadCount).toBe(3);
    expect(body.notifications.map((item: { type: string }) => item.type)).toEqual([
      "cap_blocked",
      "float_low",
      "cap_lowered_halt",
      "cap_75",
    ]);
    expect(body.notifications[0]).toMatchObject({
      cta: {
        href: `/agents/cap?agentId=${owner.agentId}#cap-controls`,
        kind: "cap_remediation",
        label: "Review cap",
      },
      readAt: null,
      resolvedAt: null,
      sticky: true,
      tier: "3",
    });
    expect(body.notifications[2]).toMatchObject({ cta: null, resolvedAt: expect.any(String) });

    const filtered = await GET(
      request(
        "GET",
        `/api/agents/notifications?agentId=${owner.agentId}&tier=2&read=unread&resolution=active&type=float_low`,
        owner.token,
      ),
    );
    await expect(filtered.json()).resolves.toMatchObject({
      notifications: [{ cta: null, type: "float_low" }],
      unreadCount: 3,
    });
  });

  it("paginates stable timestamp ties without duplicates or skipped rows", async () => {
    const owner = await provision("pages");
    const createdAt = new Date("2026-07-17T12:00:00.000Z");
    const expected = (
      await Promise.all(
        Array.from({ length: 3 }, () =>
          seed(owner.agentId, owner.cycleId, {
            createdAt,
            tier: "2",
            type: "float_low",
          }),
        ),
      )
    ).sort((left, right) => right.localeCompare(left));

    const first = await GET(
      request("GET", `/api/agents/notifications?agentId=${owner.agentId}&limit=2`, owner.token),
    );
    const firstBody = await first.json();
    expect(firstBody.notifications.map((item: { id: string }) => item.id)).toEqual(
      expected.slice(0, 2),
    );
    expect(firstBody.nextCursor).toEqual(expect.any(String));
    expect(firstBody.unreadCount).toBe(3);

    const second = await GET(
      request(
        "GET",
        `/api/agents/notifications?agentId=${owner.agentId}&limit=2&cursor=${encodeURIComponent(firstBody.nextCursor)}`,
        owner.token,
      ),
    );
    await expect(second.json()).resolves.toMatchObject({
      nextCursor: null,
      notifications: [{ id: expected[2] }],
      unreadCount: 3,
    });
  });

  it("returns the same generic not-found response across owner boundaries", async () => {
    const owner = await provision("owned");
    const foreign = await provision("foreign");
    const foreignNotificationId = await seed(foreign.agentId, foreign.cycleId, {
      createdAt: new Date("2026-07-17T13:00:00.000Z"),
      tier: "3",
      type: "cap_blocked",
    });

    const foreignAgent = await GET(
      request("GET", `/api/agents/notifications?agentId=${foreign.agentId}`, owner.token),
    );
    const foreignNotification = await PATCH(
      request("PATCH", "/api/agents/notifications", owner.token, {
        action: "read_one",
        agentId: owner.agentId,
        notificationId: foreignNotificationId,
      }),
    );
    expect(foreignAgent.status).toBe(404);
    expect(foreignNotification.status).toBe(404);
    expect(await foreignNotification.json()).toEqual(await foreignAgent.json());
  });

  it("marks one and all unread rows idempotently with real persisted timestamps", async () => {
    const owner = await provision("read");
    const firstId = await seed(owner.agentId, owner.cycleId, {
      createdAt: new Date("2026-07-17T10:00:00.000Z"),
      tier: "2",
      type: "cap_75",
    });
    await seed(owner.agentId, owner.cycleId, {
      createdAt: new Date("2026-07-17T11:00:00.000Z"),
      tier: "2",
      type: "float_low",
    });
    const readOne = { action: "read_one", agentId: owner.agentId, notificationId: firstId };

    const first = await PATCH(request("PATCH", "/api/agents/notifications", owner.token, readOne));
    await expect(first.json()).resolves.toEqual({ unreadCount: 1, updatedCount: 1 });
    const [stored] = await connection.db
      .select({ readAt: notifications.readAt })
      .from(notifications)
      .where(eq(notifications.id, firstId));
    expect(stored?.readAt).toBeInstanceOf(Date);

    const repeated = await PATCH(
      request("PATCH", "/api/agents/notifications", owner.token, readOne),
    );
    await expect(repeated.json()).resolves.toEqual({ unreadCount: 1, updatedCount: 0 });
    const [unchanged] = await connection.db
      .select({ readAt: notifications.readAt })
      .from(notifications)
      .where(eq(notifications.id, firstId));
    expect(unchanged?.readAt).toEqual(stored?.readAt);

    const readAll = { action: "read_all", agentId: owner.agentId };
    const all = await PATCH(request("PATCH", "/api/agents/notifications", owner.token, readAll));
    await expect(all.json()).resolves.toEqual({ unreadCount: 0, updatedCount: 1 });
    const allRepeated = await PATCH(
      request("PATCH", "/api/agents/notifications", owner.token, readAll),
    );
    await expect(allRepeated.json()).resolves.toEqual({ unreadCount: 0, updatedCount: 0 });
  });
});
