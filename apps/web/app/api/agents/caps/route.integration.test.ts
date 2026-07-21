import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createSessionToken, SESSION_COOKIE_NAME } from "../../../../lib/auth/session";
import { createDatabase } from "../../../../lib/db/client";
import { agents, users } from "../../../../lib/db/schema";
import { POST as resetCycle } from "../cycles/reset/route";
import { GET, PATCH, POST } from "./route";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for agent cap route tests");

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
  const token = await createSessionToken({ email, userId: owner.id });
  return { agentId: agent.id, ownerId: owner.id, token };
}

function request(
  method: "GET" | "POST" | "PATCH",
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

describe("owner-authenticated Agent cap routes", () => {
  it("requires a shared owner session and same-origin mutations", async () => {
    const owner = await provision("auth");
    const unauthorized = await GET(request("GET", `/api/agents/caps?agentId=${owner.agentId}`));
    expect(unauthorized.status).toBe(401);

    const crossOrigin = await POST(
      request(
        "POST",
        "/api/agents/caps",
        owner.token,
        { agentId: owner.agentId, amount: "10.00", frequency: "daily" },
        "https://attacker.example.test",
      ),
    );
    expect(crossOrigin.status).toBe(403);
  });

  it("sets, reads, and adjusts an exact owner-scoped cap", async () => {
    const owner = await provision("lifecycle");
    const created = await POST(
      request("POST", "/api/agents/caps", owner.token, {
        agentId: owner.agentId,
        amount: "10.00",
        frequency: "daily",
      }),
    );
    expect(created.status).toBe(201);
    expect(created.headers.get("cache-control")).toBe("no-store");
    const first = await created.json();
    expect(first.policy).toMatchObject({
      agentId: owner.agentId,
      cap: { amountUsdCents: "1000", frequency: "daily" },
      spend: { committedAtomic: "0", pendingAtomic: "0", settledAtomic: "0" },
    });

    const adjusted = await PATCH(
      request("PATCH", "/api/agents/caps", owner.token, {
        agentId: owner.agentId,
        amount: "7.50",
        frequency: "daily",
      }),
    );
    expect(adjusted.status).toBe(200);
    const second = await adjusted.json();
    expect(second.policy).toMatchObject({
      cap: { amountUsdCents: "750", frequency: "daily" },
      cycle: { id: first.policy.cycle.id },
    });

    const read = await GET(
      request("GET", `/api/agents/caps?agentId=${owner.agentId}`, owner.token),
    );
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual(second);
  });

  it("uses one generic not-found response across owner boundaries", async () => {
    const owner = await provision("owned");
    const foreign = await provision("foreign");
    const response = await POST(
      request("POST", "/api/agents/caps", foreign.token, {
        agentId: owner.agentId,
        amount: "10.00",
        frequency: "daily",
      }),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "AGENT_NOT_FOUND" },
    });

    const malformed = await POST(
      request("POST", "/api/agents/caps", owner.token, {
        agentId: owner.agentId,
        amount: "10.00",
        extra: true,
        frequency: "daily",
      }),
    );
    expect(malformed.status).toBe(400);
  });

  it("performs a real manual reset and returns a clean active cycle", async () => {
    const owner = await provision("manual");
    const created = await POST(
      request("POST", "/api/agents/caps", owner.token, {
        agentId: owner.agentId,
        amount: "10.00",
        frequency: "never",
      }),
    );
    const first = await created.json();

    const reset = await resetCycle(
      request("POST", "/api/agents/cycles/reset", owner.token, { agentId: owner.agentId }),
    );
    expect(reset.status).toBe(200);
    const body = await reset.json();
    expect(body.policy).toMatchObject({ spend: { committedAtomic: "0" } });
    expect(body.policy.cycle.id).not.toBe(first.policy.cycle.id);

    const refreshed = await GET(
      request("GET", `/api/agents/caps?agentId=${owner.agentId}`, owner.token),
    );
    await expect(refreshed.json()).resolves.toMatchObject({
      resetNotice: { reason: "manual", resetAt: body.policy.cycle.startedAt },
    });
  });
});
