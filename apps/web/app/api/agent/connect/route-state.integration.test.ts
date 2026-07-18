import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { agents } from "../../../../lib/db/schema";
import { revokeOwnerAgent } from "../../../../lib/leash/revoke-store";
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

describe("POST /api/agent/connect state transitions", () => {
  beforeEach(() => resetConnectDatabase());
  afterAll(() => closeConnectDatabase());

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
    expect(first.agent).toEqual({ address: "0x2222222222222222222222222222222222222222" });
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
});
