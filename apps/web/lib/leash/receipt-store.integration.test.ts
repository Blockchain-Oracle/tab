import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import { agents, capCycles, receipts, users } from "../db/schema";
import { parseReceiptQuery } from "./receipt-input";
import { LeashReceiptNotFoundError, listOwnerReceipts, readOwnerReceipt } from "./receipt-store";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for receipt store tests");
const connection = createDatabase(databaseUrl, 2);

beforeEach(async () => {
  await connection.client`truncate table users cascade`;
});

afterAll(async () => {
  await connection.client.end();
});

async function provision(label: string) {
  const [owner] = await connection.db
    .insert(users)
    .values({
      email: `${label}-${randomUUID()}@example.test`,
      magicIssuer: `did:ethr:${randomUUID()}`,
    })
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
  return { agentId: agent.id, cycleId: cycle.id, ownerId: owner.id };
}

type Status = "pending" | "settled" | "failed" | "blocked";

async function insertReceipt(
  owner: Awaited<ReturnType<typeof provision>>,
  input: { createdAt: Date; id?: string; network?: "eip155:8453" | "eip155:42161"; status: Status },
) {
  const id = input.id ?? randomUUID();
  const network = input.network ?? "eip155:8453";
  const txHash = `0x${id.replaceAll("-", "").padEnd(64, "a")}`;
  await connection.db.insert(receipts).values({
    agentId: owner.agentId,
    amountAtomic: "420000",
    amountUsd: "0.420000",
    asset:
      network === "eip155:8453"
        ? "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
        : "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    authorizationNonce: `0x${randomUUID().replaceAll("-", "").padEnd(64, "0")}`,
    authorizationValidBefore: new Date("2026-07-17T11:00:00.000Z"),
    capAtomicAtAttempt: "1000000",
    committedAtomicBefore: "500000",
    createdAt: input.createdAt,
    cycleId: owner.cycleId,
    id,
    intendedNetwork: input.status === "blocked" ? network : null,
    network,
    origin: { clientName: "Claude Code", toolName: "search", transport: "mcp" },
    payTo: "0x1111111111111111111111111111111111111111",
    reason:
      input.status === "blocked"
        ? "CAP_EXCEEDED"
        : input.status === "failed"
          ? "FACILITATOR_REJECTED"
          : null,
    requestFingerprint: randomUUID().replaceAll("-", "").padEnd(64, "f"),
    resourceHost: "api.example.test",
    resourceUrl: "https://api.example.test/search",
    settlementResponse: input.status === "settled" ? { success: true, transaction: txHash } : null,
    settledAt: input.status === "settled" ? new Date("2026-07-17T10:00:01.000Z") : null,
    status: input.status,
    txHash: input.status === "settled" ? txHash : null,
  });
  return id;
}

describe("owner receipt store with real PostgreSQL", () => {
  it("lists every canonical status in strict reverse chronology with a stable id tie-break", async () => {
    const owner = await provision("ordered");
    const time = new Date("2026-07-17T10:00:00.000Z");
    const ids = [
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000004",
    ];
    for (const [index, status] of (
      ["pending", "settled", "failed", "blocked"] as const
    ).entries()) {
      const id = ids[index];
      if (!id) throw new Error("Expected stable receipt id");
      await insertReceipt(owner, { createdAt: time, id, status });
    }

    const first = await listOwnerReceipts(connection.db, {
      agentId: owner.agentId,
      cursor: undefined,
      limit: 2,
      ownerId: owner.ownerId,
    });
    expect(first.receipts.map((receipt) => receipt.id)).toEqual([ids[3], ids[2]]);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await listOwnerReceipts(connection.db, {
      agentId: owner.agentId,
      cursor: parseReceiptQuery(
        new URLSearchParams({ agentId: owner.agentId, cursor: first.nextCursor ?? "" }),
      ).cursor,
      limit: 2,
      ownerId: owner.ownerId,
    });
    expect(second.receipts.map((receipt) => receipt.id)).toEqual([ids[1], ids[0]]);
    expect([...first.receipts, ...second.receipts].map((receipt) => receipt.status)).toEqual([
      "blocked",
      "failed",
      "settled",
      "pending",
    ]);
    expect(second.nextCursor).toBeNull();
  });

  it("reads exact detail while making missing and foreign resources indistinguishable", async () => {
    const owner = await provision("owner");
    const foreign = await provision("foreign");
    const receiptId = await insertReceipt(owner, {
      createdAt: new Date("2026-07-17T10:00:00.000Z"),
      network: "eip155:42161",
      status: "settled",
    });

    await expect(
      readOwnerReceipt(connection.db, { ownerId: owner.ownerId, receiptId }),
    ).resolves.toMatchObject({
      capContext: {
        capAtomic: "1000000",
        committedBeforeAtomic: "500000",
        projectedAfterAtomic: "920000",
      },
      id: receiptId,
      network: { id: "eip155:42161", label: "Arbitrum", target: false },
      origin: { clientName: "Claude Code", toolName: "search", transport: "mcp" },
    });
    for (const scope of [
      { ownerId: foreign.ownerId, receiptId },
      { ownerId: owner.ownerId, receiptId: randomUUID() },
    ]) {
      await expect(readOwnerReceipt(connection.db, scope)).rejects.toBeInstanceOf(
        LeashReceiptNotFoundError,
      );
    }
  });

  it("does not skip sub-millisecond rows across a JavaScript Date cursor", async () => {
    const owner = await provision("precision");
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    for (const [index, id] of ids.entries()) {
      await connection.client`
        insert into receipts (
          id, agent_id, cycle_id, status, amount_atomic, amount_usd, asset, network, pay_to,
          resource_url, resource_host, authorization_nonce, request_fingerprint,
          authorization_valid_before, created_at
        ) values (
          ${id}, ${owner.agentId}, ${owner.cycleId}, 'pending', 420000, 0.42,
          '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', 'eip155:8453',
          '0x1111111111111111111111111111111111111111', 'https://api.example.test/search',
          'api.example.test', ${`0x${randomUUID().replaceAll("-", "").padEnd(64, "0")}`},
          ${randomUUID().replaceAll("-", "").padEnd(64, "f")}, '2026-07-17T11:00:00Z',
          ${`2026-07-17T10:00:00.000${9 - index}00Z`}::timestamptz
        )
      `;
    }

    const first = await listOwnerReceipts(connection.db, {
      agentId: owner.agentId,
      cursor: undefined,
      limit: 2,
      ownerId: owner.ownerId,
    });
    const second = await listOwnerReceipts(connection.db, {
      agentId: owner.agentId,
      cursor: parseReceiptQuery(
        new URLSearchParams({ agentId: owner.agentId, cursor: first.nextCursor ?? "" }),
      ).cursor,
      limit: 2,
      ownerId: owner.ownerId,
    });
    const paged = [...first.receipts, ...second.receipts].map((receipt) => receipt.id);
    expect(new Set(paged)).toEqual(new Set(ids));
    expect(paged).toHaveLength(ids.length);
  });
});
