import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createDatabase } from "../db/client";
import { agents, users } from "../db/schema";
import {
  AgentProvisionConflictError,
  InvalidAgentProvisionRequestError,
  provisionAgentWallet,
} from "./provision-agent";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for provisioning integration tests");
const connection = createDatabase(databaseUrl, 3);
const firstAddress = "0x1111111111111111111111111111111111111111";
const secondAddress = "0x2222222222222222222222222222222222222222";

async function owner(label: string) {
  const email = `${label}-${randomUUID()}@example.test`;
  const [row] = await connection.db
    .insert(users)
    .values({ email, magicIssuer: `did:ethr:${randomUUID()}` })
    .returning({ id: users.id });
  if (!row) throw new Error("Expected owner");
  return { email, id: row.id };
}

beforeEach(async () => {
  await connection.client`truncate table users cascade`;
});

afterAll(async () => {
  await connection.client.end();
});

describe("Magic Express agent provisioning", () => {
  it("reuses one opaque subject and persists only the provider-returned address", async () => {
    const account = await owner("idempotent");
    const wallet = vi.fn(async (_subject: string) => firstAddress);
    const options = {
      client: { getOrCreateWallet: wallet },
      database: connection.db,
      ownerId: account.id,
      paymentProfile: "base_sepolia_integration" as const,
    };

    const first = await provisionAgentWallet({ ...options, rawBody: '{"name":"Research agent"}' });
    const repeated = await provisionAgentWallet({
      ...options,
      rawBody: '{"name":"Research agent"}',
    });

    expect(repeated).toEqual(first);
    expect(wallet).toHaveBeenCalledTimes(1);
    expect(wallet.mock.calls[0]?.[0]).toMatch(/^agent_[A-Za-z0-9_-]{32,80}$/);
    expect(wallet.mock.calls[0]?.[0]).not.toContain(account.email);
    const rows = await connection.db.select().from(agents).where(eq(agents.ownerId, account.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      agentAddress: firstAddress,
      name: "Research agent",
      paymentProfile: "base_sepolia_integration",
      signerSubject: wallet.mock.calls[0]?.[0],
    });
  });

  it("creates a different opaque subject for a different requested agent", async () => {
    const account = await owner("distinct-subject");
    const addresses = new Map<string, string>();
    const wallet = vi.fn(async (subject: string) => {
      if (!addresses.has(subject)) {
        addresses.set(subject, addresses.size === 0 ? firstAddress : secondAddress);
      }
      return addresses.get(subject) ?? firstAddress;
    });
    const base = {
      client: { getOrCreateWallet: wallet },
      database: connection.db,
      ownerId: account.id,
      paymentProfile: "base_sepolia_integration" as const,
    };

    const first = await provisionAgentWallet({ ...base, rawBody: '{"name":"First agent"}' });
    const second = await provisionAgentWallet({ ...base, rawBody: '{"name":"Second agent"}' });

    expect(first.agentAddress).toBe(firstAddress);
    expect(second.agentAddress).toBe(secondAddress);
    expect(first.id).not.toBe(second.id);
    expect(wallet.mock.calls[0]?.[0]).not.toBe(wallet.mock.calls[1]?.[0]);
  });

  it("retains the stable subject after a provider outage so retry cannot create another wallet", async () => {
    const account = await owner("provider-retry");
    const wallet = vi
      .fn<(subject: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValueOnce(firstAddress);
    const options = {
      client: { getOrCreateWallet: wallet },
      database: connection.db,
      ownerId: account.id,
      paymentProfile: "base_sepolia_integration" as const,
      rawBody: '{"name":"Retry agent"}',
    };

    await expect(provisionAgentWallet(options)).rejects.toThrow("provider unavailable");
    await expect(provisionAgentWallet(options)).resolves.toMatchObject({
      agentAddress: firstAddress,
    });
    expect(wallet.mock.calls[0]?.[0]).toBe(wallet.mock.calls[1]?.[0]);
    await expect(
      connection.db.select().from(agents).where(eq(agents.ownerId, account.id)),
    ).resolves.toHaveLength(1);
  });

  it("persists and atomically caps new provider attempts per owner in a rolling hour", async () => {
    const account = await owner("provider-rate-limit");
    const providerError = new Error("provider unavailable");
    const wallet = vi.fn(async (_subject: string) => {
      throw providerError;
    });
    const now = new Date("2026-07-18T04:00:00.000Z");
    const options = {
      client: { getOrCreateWallet: wallet },
      database: connection.db,
      now,
      ownerId: account.id,
      paymentProfile: "base_sepolia_integration" as const,
      rawBody: '{"name":"Rate-limited agent"}',
    };

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => provisionAgentWallet(options)),
    );

    expect(wallet).toHaveBeenCalledTimes(5);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(8);
    expect(
      results.filter(
        (result) =>
          result.status === "rejected" &&
          result.reason instanceof Error &&
          result.reason.message === "Too many agent provisioning attempts. Try again later.",
      ),
    ).toHaveLength(3);
    const attempts = await connection.client`
      select id from agent_provision_attempts where owner_id = ${account.id}
    `;
    expect(attempts).toHaveLength(5);

    await expect(
      provisionAgentWallet({
        ...options,
        now: new Date(now.getTime() + 60 * 60 * 1_000 + 1),
      }),
    ).rejects.toBe(providerError);
    expect(wallet).toHaveBeenCalledTimes(6);
  });

  it("caps retained agent identities before reserving a subject or calling the provider", async () => {
    const account = await owner("agent-quota");
    const retained = await connection.db
      .insert(agents)
      .values(
        Array.from({ length: 10 }, (_, index) => ({
          agentAddress: `0x${(index + 1).toString(16).padStart(40, "0")}`,
          name: `Retained agent ${index + 1}`,
          ownerId: account.id,
          signerSubject: `agent_quota_${index}_${randomUUID()}`,
        })),
      )
      .returning({ agentAddress: agents.agentAddress, id: agents.id, name: agents.name });
    const wallet = vi.fn(async (_subject: string) => firstAddress);

    await expect(
      provisionAgentWallet({
        client: { getOrCreateWallet: wallet },
        database: connection.db,
        ownerId: account.id,
        paymentProfile: "mainnet",
        rawBody: '{"name":"Eleventh agent"}',
      }),
    ).rejects.toThrow("The agent provisioning quota has been reached.");
    expect(wallet).not.toHaveBeenCalled();
    await expect(
      connection.db.select().from(agents).where(eq(agents.ownerId, account.id)),
    ).resolves.toHaveLength(10);
    const attempts = await connection.client`
      select id from agent_provision_attempts where owner_id = ${account.id}
    `;
    expect(attempts).toHaveLength(0);

    const first = retained[0];
    if (!first?.agentAddress) throw new Error("Expected retained agent");
    await expect(
      provisionAgentWallet({
        client: { getOrCreateWallet: wallet },
        database: connection.db,
        ownerId: account.id,
        paymentProfile: "mainnet",
        rawBody: JSON.stringify({ agentId: first.id, name: first.name }),
      }),
    ).resolves.toMatchObject({ agentAddress: first.agentAddress, id: first.id });
    expect(wallet).not.toHaveBeenCalled();
  });

  it("fails closed for malformed input and a provider address conflicting with stored identity", async () => {
    const account = await owner("conflict");
    await expect(
      provisionAgentWallet({
        client: { getOrCreateWallet: async () => firstAddress },
        database: connection.db,
        ownerId: account.id,
        paymentProfile: "mainnet",
        rawBody: '{"name":"  "}',
      }),
    ).rejects.toBeInstanceOf(InvalidAgentProvisionRequestError);

    const first = await provisionAgentWallet({
      client: { getOrCreateWallet: async () => firstAddress },
      database: connection.db,
      ownerId: account.id,
      paymentProfile: "mainnet",
      rawBody: '{"name":"Conflict agent"}',
    });
    await expect(
      provisionAgentWallet({
        client: { getOrCreateWallet: async () => secondAddress },
        database: connection.db,
        ownerId: account.id,
        paymentProfile: "base_sepolia_integration",
        rawBody: JSON.stringify({ agentId: first.id, name: "Conflict agent" }),
      }),
    ).rejects.toBeInstanceOf(AgentProvisionConflictError);
  });
});
