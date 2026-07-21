import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { POST } from "./route";
import { createRevokeRouteHarness } from "./route-test-support";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for revoke route tests");
const harness = createRevokeRouteHarness(databaseUrl);

beforeEach(async () => {
  await harness.reset();
});

afterAll(async () => {
  await harness.close();
});

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  await expect(response.json()).resolves.toMatchObject({ error: { code } });
}

describe("POST /api/agents/revoke with real PostgreSQL", () => {
  it("requires an owner session and same-origin strict JSON", async () => {
    const owner = await harness.provision("guard");
    await expectError(
      await POST(harness.request({ action: "pause", agentId: owner.agentId })),
      401,
      "SESSION_REQUIRED",
    );
    await expectError(
      await POST(
        harness.request(
          { action: "pause", agentId: owner.agentId },
          owner.token,
          "https://attacker.example.test",
        ),
      ),
      403,
      "ORIGIN_NOT_ALLOWED",
    );

    for (const body of [
      { action: "pause", agentId: owner.agentId, extra: true },
      { action: "cancel", agentId: owner.agentId, confirmation: "cancel" },
    ]) {
      await expectError(
        await POST(harness.request(body, owner.token)),
        400,
        "INVALID_REVOKE_INPUT",
      );
    }
    await expectError(
      await POST(harness.request("{", owner.token, undefined, true)),
      400,
      "INVALID_REVOKE_INPUT",
    );
    expect(await harness.status(owner.agentId)).toBe("provisioned");
  });

  it("makes foreign and nonexistent agents the same generic 404", async () => {
    const owner = await harness.provision("owned");
    const foreign = await harness.provision("foreign");
    const responses = await Promise.all(
      [foreign.agentId, randomUUID()].map((agentId) =>
        POST(harness.request({ action: "pause", agentId }, owner.token)),
      ),
    );
    for (const response of responses) {
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.status).toBe(404);
    }
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[0]).toEqual({
      error: { code: "AGENT_NOT_FOUND", message: "The agent was not found." },
    });
    expect(await harness.status(foreign.agentId)).toBe("provisioned");
  });

  it("pauses and resumes with the exact safe response projection and web audit", async () => {
    const owner = await harness.provision("reversible");
    const paused = await POST(
      harness.request({ action: "pause", agentId: owner.agentId }, owner.token),
    );
    expect(paused.status).toBe(200);
    expect(paused.headers.get("cache-control")).toBe("no-store");
    await expect(paused.json()).resolves.toEqual({
      agentId: owner.agentId,
      changed: true,
      status: "paused",
    });
    expect(await harness.revocations(owner.agentId)).toEqual([
      {
        actorSurface: "web",
        metadata: { action: "pause", fromStatus: "provisioned", toStatus: "paused" },
      },
    ]);

    const resumed = await POST(
      harness.request({ action: "resume", agentId: owner.agentId }, owner.token),
    );
    expect(resumed.status).toBe(200);
    expect(resumed.headers.get("cache-control")).toBe("no-store");
    await expect(resumed.json()).resolves.toEqual({
      agentId: owner.agentId,
      changed: true,
      status: "provisioned",
    });
  });

  it("cancels only with exact confirmation and rejects later transitions", async () => {
    const owner = await harness.provision("cancel");
    const cancelled = await POST(
      harness.request(
        { action: "cancel", agentId: owner.agentId, confirmation: "CANCEL" },
        owner.token,
      ),
    );
    expect(cancelled.status).toBe(200);
    expect(cancelled.headers.get("cache-control")).toBe("no-store");
    await expect(cancelled.json()).resolves.toEqual({
      agentId: owner.agentId,
      changed: true,
      status: "cancelled",
    });
    await expectError(
      await POST(harness.request({ action: "resume", agentId: owner.agentId }, owner.token)),
      409,
      "INVALID_AGENT_TRANSITION",
    );
  });

  it("requires the exact agent name for nuclear and keeps the tombstone permanent", async () => {
    const owner = await harness.provision("Exact Name");
    await expectError(
      await POST(
        harness.request(
          { action: "nuclear", agentId: owner.agentId, confirmation: owner.name.toLowerCase() },
          owner.token,
        ),
      ),
      409,
      "INVALID_NUCLEAR_CONFIRMATION",
    );
    const nuked = await POST(
      harness.request(
        { action: "nuclear", agentId: owner.agentId, confirmation: owner.name },
        owner.token,
      ),
    );
    expect(nuked.status).toBe(200);
    expect(nuked.headers.get("cache-control")).toBe("no-store");
    await expect(nuked.json()).resolves.toEqual({
      agentId: owner.agentId,
      changed: true,
      status: "nuked",
    });
    await expectError(
      await POST(harness.request({ action: "pause", agentId: owner.agentId }, owner.token)),
      409,
      "INVALID_AGENT_TRANSITION",
    );
  });
});
