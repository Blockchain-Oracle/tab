import { randomBytes, randomUUID } from "node:crypto";

import { and, asc, eq, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { issueLeashKey } from "../auth/leash-key";
import { createDatabase } from "../db/client";
import { agents, capCycles, caps, notifications, receipts, users } from "../db/schema";
import { completePreSigningChecks, reserveSignRequest } from "./sign-store";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for cycle integration tests");

const connection = createDatabase(databaseUrl, 4);
const agentAddress = "0x2222222222222222222222222222222222222222";
const payTo = "0x1111111111111111111111111111111111111111";
const baseUsdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

beforeEach(async () => {
  await connection.client`truncate table users cascade`;
});

afterAll(async () => {
  await connection.client.end();
});

async function provision(frequency: "daily" | "weekly" | "monthly" | "never", startedAt: Date) {
  const [owner] = await connection.db
    .insert(users)
    .values({ email: `${randomUUID()}@example.test`, magicIssuer: `did:ethr:${randomUUID()}` })
    .returning({ id: users.id });
  if (!owner) throw new Error("Expected cycle owner");
  const [agent] = await connection.db
    .insert(agents)
    .values({
      agentAddress,
      name: "Cycle test",
      ownerId: owner.id,
      signerSubject: `leash:${randomUUID()}`,
    })
    .returning({ id: agents.id });
  if (!agent) throw new Error("Expected cycle agent");
  const key = await issueLeashKey(connection.db, { agentId: agent.id });
  await connection.db.insert(caps).values({
    agentId: agent.id,
    amountUsdCents: "100",
    frequency,
  });
  const [cycle] = await connection.db
    .insert(capCycles)
    .values({ agentId: agent.id, startedAt })
    .returning({ id: capCycles.id });
  if (!cycle) throw new Error("Expected active cycle");
  return { agentId: agent.id, cycleId: cycle.id, keyId: key.key.id };
}

function signBody(nowSeconds: number, amount = "100000", nonce = randomBytes(32).toString("hex")) {
  return {
    amount,
    asset: baseUsdc,
    network: "eip155:8453",
    origin: { clientName: "Cycle integration", toolName: "pay", transport: "mcp" },
    payTo,
    resourceUrl: "mcp://tool/pay",
    signerRequest: {
      domain: { chainId: 8453, name: "USD Coin", verifyingContract: baseUsdc, version: "2" },
      message: {
        from: agentAddress,
        nonce: `0x${nonce}`,
        to: payTo,
        validAfter: "0",
        validBefore: String(nowSeconds + 300),
        value: amount,
      },
      primaryType: "TransferWithAuthorization",
      types: {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
    },
  };
}

async function reserveAt(
  identity: Awaited<ReturnType<typeof provision>>,
  now: Date,
  nonce?: string,
) {
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  return reserveSignRequest(connection.db, {
    agentId: identity.agentId,
    body: signBody(nowSeconds, "100000", nonce),
    keyId: identity.keyId,
    nowSeconds,
  });
}

async function insertOldSettled(identity: Awaited<ReturnType<typeof provision>>) {
  const txHash = `0x${randomBytes(32).toString("hex")}`;
  const [row] = await connection.db
    .insert(receipts)
    .values({
      agentId: identity.agentId,
      amountAtomic: "1000000",
      amountUsd: "1.000000",
      asset: baseUsdc,
      authorizationNonce: `0x${randomBytes(32).toString("hex")}`,
      authorizationValidBefore: new Date("2030-01-01T00:00:00.000Z"),
      cycleId: identity.cycleId,
      network: "eip155:8453",
      payTo,
      requestFingerprint: randomBytes(32).toString("hex"),
      settledAt: new Date("2026-01-01T00:01:00.000Z"),
      settlementResponse: { success: true, transaction: txHash, verified: true },
      status: "settled",
      txHash,
    })
    .returning({ id: receipts.id });
  if (!row) throw new Error("Expected old receipt");
  return row.id;
}

describe("scheduled cap-cycle rollover with real PostgreSQL", () => {
  it("advances missed periods and leaves historical receipts in the closed cycle", async () => {
    const identity = await provision("daily", new Date("2026-01-01T00:00:00.000Z"));
    const oldReceiptId = await insertOldSettled(identity);
    const result = await reserveAt(identity, new Date("2026-04-15T12:00:00.000Z"));
    expect(result).toMatchObject({ kind: "pending" });

    const cycles = await connection.db
      .select()
      .from(capCycles)
      .where(eq(capCycles.agentId, identity.agentId))
      .orderBy(asc(capCycles.startedAt));
    expect(cycles).toMatchObject([
      {
        endedAt: new Date("2026-01-02T00:00:00.000Z"),
        id: identity.cycleId,
        resetReason: "schedule",
      },
      { endedAt: null, startedAt: new Date("2026-04-15T00:00:00.000Z") },
    ]);
    const stored = await connection.db
      .select({ cycleId: receipts.cycleId, id: receipts.id })
      .from(receipts)
      .where(eq(receipts.agentId, identity.agentId));
    expect(stored.find((row) => row.id === oldReceiptId)?.cycleId).toBe(identity.cycleId);
    expect(stored.find((row) => row.id === result.receiptId)?.cycleId).toBe(cycles[1]?.id);
  });

  it("creates one active cycle for concurrent first reads at an exact boundary", async () => {
    const identity = await provision("daily", new Date("2026-07-16T00:00:00.000Z"));
    const boundary = new Date("2026-07-17T00:00:00.000Z");
    const results = await Promise.all([
      reserveAt(identity, boundary, "1".repeat(64)),
      reserveAt(identity, boundary, "2".repeat(64)),
    ]);
    expect(results.map((result) => result.kind)).toEqual(["pending", "pending"]);

    const active = await connection.db
      .select({ id: capCycles.id, startedAt: capCycles.startedAt })
      .from(capCycles)
      .where(and(eq(capCycles.agentId, identity.agentId), isNull(capCycles.endedAt)));
    expect(active).toEqual([{ id: expect.any(String), startedAt: boundary }]);
    const receiptCycles = await connection.db
      .select({ cycleId: receipts.cycleId })
      .from(receipts)
      .where(eq(receipts.agentId, identity.agentId));
    expect(new Set(receiptCycles.map((row) => row.cycleId))).toEqual(new Set([active[0]?.id]));
  });

  it("auto-resumes a cap halt when the scheduled UTC cycle rolls", async () => {
    const identity = await provision("daily", new Date("2026-07-16T00:00:00.000Z"));
    const [alert] = await connection.db
      .insert(notifications)
      .values({
        agentId: identity.agentId,
        createdAt: new Date("2026-07-16T12:00:00.000Z"),
        cycleId: identity.cycleId,
        eventKey: `cap_lowered_halt:${identity.cycleId}:test`,
        metadata: {},
        sticky: true,
        tier: "3",
        type: "cap_lowered_halt",
      })
      .returning({ id: notifications.id });
    if (!alert) throw new Error("Expected cap halt notification");

    const boundary = new Date("2026-07-17T00:00:00.000Z");
    await expect(reserveAt(identity, boundary)).resolves.toMatchObject({ kind: "pending" });
    const [resolved] = await connection.db
      .select({ resolvedAt: notifications.resolvedAt })
      .from(notifications)
      .where(eq(notifications.id, alert.id));
    expect(resolved?.resolvedAt).toEqual(boundary);
  });

  it("keeps a never-frequency cycle open", async () => {
    const identity = await provision("never", new Date("2026-01-01T00:00:00.000Z"));
    const result = await reserveAt(identity, new Date("2030-07-17T00:00:00.000Z"));
    expect(result).toMatchObject({ kind: "pending" });

    const cycles = await connection.db
      .select({ endedAt: capCycles.endedAt, id: capCycles.id })
      .from(capCycles)
      .where(eq(capCycles.agentId, identity.agentId));
    expect(cycles).toEqual([{ endedAt: null, id: identity.cycleId }]);
  });

  it("retains a month-end anchor across sequential persisted rollovers", async () => {
    const identity = await provision("monthly", new Date("2026-01-31T10:15:00.000Z"));

    await expect(reserveAt(identity, new Date("2026-02-28T00:00:00.000Z"))).resolves.toMatchObject({
      kind: "pending",
    });
    await expect(reserveAt(identity, new Date("2026-03-31T00:00:00.000Z"))).resolves.toMatchObject({
      kind: "pending",
    });

    const cycles = await connection.db
      .select({ endedAt: capCycles.endedAt, startedAt: capCycles.startedAt })
      .from(capCycles)
      .where(eq(capCycles.agentId, identity.agentId))
      .orderBy(asc(capCycles.startedAt));
    expect(cycles).toEqual([
      {
        endedAt: new Date("2026-02-28T00:00:00.000Z"),
        startedAt: new Date("2026-01-31T10:15:00.000Z"),
      },
      {
        endedAt: new Date("2026-03-31T00:00:00.000Z"),
        startedAt: new Date("2026-02-28T00:00:00.000Z"),
      },
      { endedAt: null, startedAt: new Date("2026-03-31T00:00:00.000Z") },
    ]);
  });

  it("rolls during final preflight and rejects the old-cycle reservation", async () => {
    const identity = await provision("daily", new Date("2026-07-16T00:00:00.000Z"));
    const reservedAt = new Date("2026-07-16T23:59:00.000Z");
    const reserved = await reserveAt(identity, reservedAt);
    if (reserved.kind !== "pending") throw new Error("Expected pending reservation");

    await expect(
      completePreSigningChecks(connection.db, {
        agentId: identity.agentId,
        keyId: identity.keyId,
        liveBalanceAtomic: BigInt(10_000_000),
        nowSeconds: Math.floor(new Date("2026-07-17T00:00:00.000Z").getTime() / 1_000),
        receiptId: reserved.receiptId,
        signerAvailable: true,
      }),
    ).resolves.toMatchObject({ code: "CAP_CYCLE_CHANGED", kind: "failed" });

    const [active] = await connection.db
      .select({ startedAt: capCycles.startedAt })
      .from(capCycles)
      .where(and(eq(capCycles.agentId, identity.agentId), isNull(capCycles.endedAt)));
    expect(active?.startedAt).toEqual(new Date("2026-07-17T00:00:00.000Z"));
  });
});
