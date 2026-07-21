import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/leash/fund-balances", () => ({
  readLeashFloatBalances: vi.fn(),
}));

import { createSessionToken, SESSION_COOKIE_NAME } from "../../../../lib/auth/session";
import { createDatabase } from "../../../../lib/db/client";
import { agents, users } from "../../../../lib/db/schema";
import { closeServerDatabase } from "../../../../lib/db/server";
import { readLeashFloatBalances } from "../../../../lib/leash/fund-balances";
import { GET } from "./route";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for float balance route tests");
const connection = createDatabase(databaseUrl, 2);
const appOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost").origin;
const readFloats = vi.mocked(readLeashFloatBalances);

beforeEach(async () => {
  await connection.client`truncate table users cascade`;
  readFloats.mockReset();
});

afterAll(async () => {
  await closeServerDatabase();
  await connection.client.end();
});

async function provision(
  label: string,
  agentAddress?: string,
  paymentProfile: "mainnet" | "base_sepolia_integration" = "mainnet",
) {
  const email = `${label}-${randomUUID()}@example.test`;
  const [owner] = await connection.db
    .insert(users)
    .values({ email, magicIssuer: `did:ethr:${randomUUID()}` })
    .returning({ id: users.id });
  if (!owner) throw new Error("Expected owner");
  const [agent] = await connection.db
    .insert(agents)
    .values({
      agentAddress,
      name: `${label} agent`,
      ownerId: owner.id,
      paymentProfile,
      signerSubject: `leash:${randomUUID()}`,
    })
    .returning({ id: agents.id });
  if (!agent) throw new Error("Expected agent");
  return {
    agentId: agent.id,
    token: await createSessionToken({ email, userId: owner.id }),
  };
}

function request(query: string, token?: string) {
  return new NextRequest(new URL(`/api/agents/float-balances${query}`, appOrigin), {
    headers: token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  });
}

describe("GET /api/agents/float-balances with real PostgreSQL ownership", () => {
  it("requires owner auth and one exact UUID agent query", async () => {
    const owner = await provision("strict");
    expect((await GET(request(`?agentId=${owner.agentId}`))).status).toBe(401);
    for (const query of [
      "",
      "?agentId=not-a-uuid",
      `?agentId=${owner.agentId}&agentId=${owner.agentId}`,
      `?agentId=${owner.agentId}&extra=true`,
    ]) {
      const response = await GET(request(query, owner.token));
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(readFloats).not.toHaveBeenCalled();
  });

  it("reads the stored owner agent address and reports timestamped RPC health", async () => {
    const address = "0x1111111111111111111111111111111111111111";
    const owner = await provision("live", address);
    readFloats.mockResolvedValue([
      { balanceAtomic: "1000000", label: "Base", network: "eip155:8453", testFunds: false },
      {
        balanceAtomic: "250000",
        label: "Arbitrum",
        network: "eip155:42161",
        testFunds: false,
      },
    ]);
    const response = await GET(request(`?agentId=${owner.agentId}`, owner.token));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(readFloats).toHaveBeenCalledWith(address, "mainnet");
    await expect(response.json()).resolves.toEqual({
      agentId: owner.agentId,
      floats: [
        {
          balanceAtomic: "1000000",
          label: "Base",
          network: "eip155:8453",
          testFunds: false,
        },
        {
          balanceAtomic: "250000",
          label: "Arbitrum",
          network: "eip155:42161",
          testFunds: false,
        },
      ],
      health: "healthy",
      paymentProfile: "mainnet",
      readAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      testFunds: false,
      testFundsLabel: null,
    });
  });

  it("reads only the persisted Base Sepolia profile and labels every value as test funds", async () => {
    const address = "0x2222222222222222222222222222222222222222";
    const owner = await provision("testnet", address, "base_sepolia_integration");
    readFloats.mockResolvedValue([
      {
        balanceAtomic: "1000",
        label: "Base Sepolia",
        network: "eip155:84532",
        testFunds: true,
      },
    ]);

    const response = await GET(request(`?agentId=${owner.agentId}`, owner.token));
    expect(readFloats).toHaveBeenCalledWith(address, "base_sepolia_integration");
    await expect(response.json()).resolves.toMatchObject({
      floats: [
        {
          balanceAtomic: "1000",
          label: "Base Sepolia",
          network: "eip155:84532",
          testFunds: true,
        },
      ],
      health: "healthy",
      paymentProfile: "base_sepolia_integration",
      testFunds: true,
      testFundsLabel: "Sandbox funds — no real value",
    });
  });

  it("makes foreign and missing agents identical without invoking an RPC read", async () => {
    const owner = await provision("owner");
    const foreign = await provision("foreign");
    const responses = await Promise.all(
      [foreign.agentId, randomUUID()].map((agentId) =>
        GET(request(`?agentId=${agentId}`, owner.token)),
      ),
    );
    expect(responses.map((response) => response.status)).toEqual([404, 404]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[0]).toEqual({
      error: { code: "AGENT_NOT_FOUND", message: "The agent was not found." },
    });
    expect(readFloats).not.toHaveBeenCalled();
  });
});
