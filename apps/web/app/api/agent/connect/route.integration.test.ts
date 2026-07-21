import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { leashKeys } from "../../../../lib/db/schema";
import { POST } from "./route";
import {
  agentRow,
  closeConnectDatabase,
  connection,
  eventsFor,
  provisionAgent,
  request,
  resetConnectDatabase,
} from "./route.integration-support";

describe("POST /api/agent/connect with real PostgreSQL", () => {
  beforeEach(() => resetConnectDatabase());
  afterAll(() => closeConnectDatabase());

  it("returns the same no-store 401 for missing, malformed, unknown, and revoked keys", async () => {
    const provisioned = await provisionAgent("unauthorized");
    await connection.db
      .update(leashKeys)
      .set({ revokedAt: new Date() })
      .where(eq(leashKeys.id, provisioned.keyId));

    const bodies = await Promise.all([
      POST(request({ transport: "mcp" })),
      POST(request({ transport: "mcp" }, "not-a-key")),
      POST(request({ transport: "mcp" }, `agent_sk_${"z".repeat(43)}`)),
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
      paymentProfile: "mainnet",
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

  it("returns the persisted integration profile without accepting a client override", async () => {
    const provisioned = await provisionAgent(
      "integration-profile",
      "provisioned",
      "base_sepolia_integration",
    );
    const response = await POST(request({ transport: "mcp" }, provisioned.secret));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      paymentProfile: "base_sepolia_integration",
    });
  });
});
