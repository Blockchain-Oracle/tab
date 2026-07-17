import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { issueLeashKey } from "../../../../lib/auth/leash-key";
import { createDatabase } from "../../../../lib/db/client";
import { agentEvents, agents, leashKeys, users } from "../../../../lib/db/schema";
import { closeServerDatabase } from "../../../../lib/db/server";
import { revokeOwnerAgent } from "../../../../lib/leash/revoke-store";
import { POST } from "./route";

const databaseUrl = process.env.DATABASE_URL;
const appOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost").origin;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for agent connect integration tests");
}

const connection = createDatabase(databaseUrl, 4);

type AgentStatus = "provisioned" | "paused" | "frozen" | "cancelled" | "nuked";

function request(body: unknown, secret?: string) {
  return new NextRequest(`${appOrigin}/api/agent/connect`, {
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: {
      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      "content-type": "application/json",
    },
    method: "POST",
  });
}

async function provisionAgent(label: string, status: AgentStatus = "provisioned") {
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
      signerSubject: `leash:${randomUUID()}`,
      status,
    })
    .returning({ id: agents.id });
  if (!agent) throw new Error("PostgreSQL did not return the Leash agent");

  const key = await issueLeashKey(connection.db, { agentId: agent.id });
  return { agentId: agent.id, keyId: key.key.id, ownerId: user.id, secret: key.secret };
}

async function agentRow(agentId: string) {
  const [row] = await connection.db.select().from(agents).where(eq(agents.id, agentId));
  return row;
}

async function eventsFor(agentId: string) {
  return connection.db.select().from(agentEvents).where(eq(agentEvents.agentId, agentId));
}

describe("POST /api/agent/connect with real PostgreSQL", () => {
  beforeEach(async () => {
    await connection.client`truncate table users cascade`;
  });

  afterAll(async () => {
    await closeServerDatabase();
    await connection.client.end();
  });

  it("returns the same no-store 401 for missing, malformed, unknown, and revoked keys", async () => {
    const provisioned = await provisionAgent("unauthorized");
    await connection.db
      .update(leashKeys)
      .set({ revokedAt: new Date() })
      .where(eq(leashKeys.id, provisioned.keyId));

    const bodies = await Promise.all([
      POST(request({ transport: "mcp" })),
      POST(request({ transport: "mcp" }, "not-a-key")),
      POST(request({ transport: "mcp" }, `leash_sk_${"z".repeat(43)}`)),
      POST(request({ transport: "mcp" }, provisioned.secret)),
    ]);

    for (const response of bodies) {
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toEqual({
        error: { code: "UNAUTHORIZED", message: "Authentication is required." },
      });
    }
    expect((await agentRow(provisioned.agentId))?.connectionCount).toBe(0);
    await expect(eventsFor(provisioned.agentId)).resolves.toEqual([]);
  });

  it("strictly rejects malformed, extra, empty, and oversized client input", async () => {
    const provisioned = await provisionAgent("invalid-input");
    const invalidBodies = [
      "{",
      " ".repeat(2_049),
      {},
      { transport: "stdio" },
      { extra: true, transport: "mcp" },
      { clientInfo: null, transport: "mcp" },
      { clientInfo: {}, transport: "mcp" },
      { clientInfo: { extra: true, name: "Claude Code" }, transport: "mcp" },
      { clientInfo: { name: "" }, transport: "mcp" },
      { clientInfo: { name: " ".repeat(10) }, transport: "mcp" },
      { clientInfo: { name: "x".repeat(201) }, transport: "mcp" },
      { clientInfo: { name: "Claude Code", version: "" }, transport: "mcp" },
      { clientInfo: { name: "Claude Code", version: "x".repeat(101) }, transport: "mcp" },
    ];

    for (const body of invalidBodies) {
      const response = await POST(request(body, provisioned.secret));
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toEqual({
        error: { code: "INVALID_CONNECT_REQUEST", message: "The connect request is invalid." },
      });
    }

    expect((await agentRow(provisioned.agentId))?.connectionCount).toBe(0);
    await expect(eventsFor(provisioned.agentId)).resolves.toEqual([]);
  });

  it("stores absent identity as null and renders only the response as Unknown client", async () => {
    const provisioned = await provisionAgent("unknown-client", "frozen");
    const response = await POST(request({ transport: "http" }, provisioned.secret));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      agent: { address: null },
      client: {
        connectionCount: 1,
        firstSeenAt: expect.any(String),
        lastSeenAt: expect.any(String),
        name: "Unknown client",
        transport: "http",
        version: null,
      },
    });
    expect(await agentRow(provisioned.agentId)).toMatchObject({
      clientName: null,
      clientVersion: null,
      connectionCount: 1,
      firstSeenAt: new Date(body.client.firstSeenAt),
      lastSeenAt: new Date(body.client.lastSeenAt),
      transport: "http",
    });
    await expect(eventsFor(provisioned.agentId)).resolves.toEqual([
      expect.objectContaining({
        actorSurface: "agent",
        metadata: {
          clientName: null,
          clientVersion: null,
          connectionCount: 1,
          transport: "http",
        },
        type: "connect",
      }),
    ]);
    expect(JSON.stringify(await eventsFor(provisioned.agentId))).not.toContain(provisioned.secret);
  });

  it("preserves raw bounded client identity and advances the canonical latest view", async () => {
    const provisioned = await provisionAgent("known-client", "paused");
    await connection.db
      .update(agents)
      .set({ agentAddress: "0x2222222222222222222222222222222222222222" })
      .where(eq(agents.id, provisioned.agentId));
    const firstResponse = await POST(
      request(
        { clientInfo: { name: " Claude Code ", version: " 1.2.3 " }, transport: "mcp" },
        provisioned.secret,
      ),
    );
    const first = await firstResponse.json();
    const secondResponse = await POST(request({ transport: "http" }, provisioned.secret));
    const second = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(first.agent).toEqual({
      address: "0x2222222222222222222222222222222222222222",
    });
    expect(first.client).toMatchObject({
      connectionCount: 1,
      name: " Claude Code ",
      transport: "mcp",
      version: " 1.2.3 ",
    });
    expect(secondResponse.status).toBe(200);
    expect(second.client).toMatchObject({
      connectionCount: 2,
      firstSeenAt: first.client.firstSeenAt,
      name: "Unknown client",
      transport: "http",
      version: null,
    });
    expect(Date.parse(second.client.lastSeenAt)).toBeGreaterThanOrEqual(
      Date.parse(first.client.lastSeenAt),
    );
    expect(await agentRow(provisioned.agentId)).toMatchObject({
      clientName: null,
      clientVersion: null,
      connectionCount: 2,
      firstSeenAt: new Date(first.client.firstSeenAt),
      lastSeenAt: new Date(second.client.lastSeenAt),
      transport: "http",
    });
    await expect(eventsFor(provisioned.agentId)).resolves.toHaveLength(2);
  });

  it("allows credential-preserving lifecycle statuses to report a connection", async () => {
    for (const status of ["provisioned", "paused", "frozen"] as const) {
      const provisioned = await provisionAgent(`status-${status}`, status);
      const response = await POST(request({ transport: "mcp" }, provisioned.secret));

      expect(response.status).toBe(200);
      expect((await agentRow(provisioned.agentId))?.connectionCount).toBe(1);
    }
  });

  it.each(["cancelled", "nuked"] as const)("rejects an old key after %s", async (status) => {
    const label = `terminal-${status}`;
    const provisioned = await provisionAgent(label);
    await revokeOwnerAgent(connection.db, {
      action: status === "cancelled" ? "cancel" : "nuclear",
      actorSurface: "web",
      agentId: provisioned.agentId,
      confirmation: status === "cancelled" ? "CANCEL" : `${label} agent`,
      ownerId: provisioned.ownerId,
    });

    const response = await POST(request({ transport: "mcp" }, provisioned.secret));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await agentRow(provisioned.agentId))?.connectionCount).toBe(0);
    expect(
      (await eventsFor(provisioned.agentId)).filter((event) => event.type === "connect"),
    ).toEqual([]);
  });

  it("serializes concurrent reports without losing counts or audit events", async () => {
    const provisioned = await provisionAgent("concurrent");
    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        POST(
          request(
            {
              clientInfo: { name: `client-${index}`, version: `${index}` },
              transport: index % 2 === 0 ? "mcp" : "http",
            },
            provisioned.secret,
          ),
        ),
      ),
    );
    const counts = await Promise.all(
      responses.map(async (response) => {
        expect(response.status).toBe(200);
        return (await response.json()).client.connectionCount as number;
      }),
    );

    expect(counts.toSorted((left, right) => left - right)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const stored = await agentRow(provisioned.agentId);
    expect(stored?.connectionCount).toBe(8);
    expect(stored?.firstSeenAt).toBeInstanceOf(Date);
    expect(stored?.lastSeenAt).toBeInstanceOf(Date);
    await expect(eventsFor(provisioned.agentId)).resolves.toHaveLength(8);
  });
});
