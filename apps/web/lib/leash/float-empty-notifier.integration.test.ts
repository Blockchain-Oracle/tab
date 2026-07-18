import { randomBytes, randomUUID } from "node:crypto";

import { asc } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import { agents, capCycles, notifications, receipts, users } from "../db/schema";
import { emitFloatEmpty } from "./notifier";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for float-empty notifier tests");

const connection = createDatabase(databaseUrl, 4);
const baseUsdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const arbitrumUsdc = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const baseSepoliaUsdc = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const payTo = "0x1111111111111111111111111111111111111111";

beforeEach(async () => {
  await connection.client`truncate table users cascade`;
});

afterAll(async () => {
  await connection.client.end();
});

async function provision() {
  const [owner] = await connection.db
    .insert(users)
    .values({
      email: `${randomUUID()}@example.test`,
      magicIssuer: `did:ethr:${randomUUID()}`,
    })
    .returning({ id: users.id });
  if (!owner) throw new Error("Expected owner");
  const [agent] = await connection.db
    .insert(agents)
    .values({ ownerId: owner.id, name: "Float notifier", signerSubject: `leash:${randomUUID()}` })
    .returning({ id: agents.id });
  if (!agent) throw new Error("Expected agent");
  const [cycle] = await connection.db
    .insert(capCycles)
    .values({ agentId: agent.id, startedAt: new Date("2026-07-17T00:00:00.000Z") })
    .returning({ id: capCycles.id });
  if (!cycle) throw new Error("Expected cycle");
  const agentId = agent.id;
  const cycleId = cycle.id;

  async function receipt(network: "eip155:8453" | "eip155:42161" | "eip155:84532", asset: string) {
    const [row] = await connection.db
      .insert(receipts)
      .values({
        agentId,
        amountAtomic: "600000",
        amountUsd: "0.600000",
        asset,
        authorizationNonce: `0x${randomBytes(32).toString("hex")}`,
        authorizationValidBefore: new Date("2030-01-01T00:00:00.000Z"),
        cycleId,
        network,
        payTo,
        requestFingerprint: randomBytes(32).toString("hex"),
      })
      .returning({ id: receipts.id });
    if (!row) throw new Error("Expected receipt");
    return row.id;
  }

  return {
    agentId,
    arbitrumReceiptId: await receipt("eip155:42161", arbitrumUsdc),
    baseReceiptId: await receipt("eip155:8453", baseUsdc),
    baseSepoliaReceiptId: await receipt("eip155:84532", baseSepoliaUsdc),
    cycleId,
  };
}

describe("float-empty notifier multi-chain dedupe", () => {
  it("emits once per cycle and network under concurrent duplicate delivery", async () => {
    const identity = await provision();
    const now = new Date("2026-07-17T00:01:00.000Z");
    const base = {
      agentId: identity.agentId,
      availableAtomic: "100000",
      cycleId: identity.cycleId,
      network: "eip155:8453" as const,
      now,
      receiptId: identity.baseReceiptId,
      reservedAtomic: "600000",
    };
    const arbitrum = {
      ...base,
      availableAtomic: "200000",
      network: "eip155:42161" as const,
      receiptId: identity.arbitrumReceiptId,
      reservedAtomic: "700000",
    };

    const [baseFirst, baseReplay, arbitrumFirst] = await Promise.all([
      connection.db.transaction((transaction) => emitFloatEmpty(transaction, base)),
      connection.db.transaction((transaction) => emitFloatEmpty(transaction, base)),
      connection.db.transaction((transaction) => emitFloatEmpty(transaction, arbitrum)),
    ]);

    expect(baseReplay.id).toBe(baseFirst.id);
    expect(arbitrumFirst.id).not.toBe(baseFirst.id);
    const rows = await connection.db
      .select()
      .from(notifications)
      .orderBy(asc(notifications.eventKey));
    expect(rows.map((row) => row.eventKey)).toEqual([
      `float_empty:${identity.cycleId}:eip155:42161`,
      `float_empty:${identity.cycleId}:eip155:8453`,
    ]);
    expect(rows.map((row) => row.metadata)).toEqual([
      {
        availableAtomic: "200000",
        network: "eip155:42161",
        reservedAtomic: "700000",
        testFunds: false,
        testFundsLabel: null,
      },
      {
        availableAtomic: "100000",
        network: "eip155:8453",
        reservedAtomic: "600000",
        testFunds: false,
        testFundsLabel: null,
      },
    ]);
  });

  it("marks a Base Sepolia empty-float alert as test funds", async () => {
    const identity = await provision();
    const notification = await connection.db.transaction((transaction) =>
      emitFloatEmpty(transaction, {
        agentId: identity.agentId,
        availableAtomic: "0",
        cycleId: identity.cycleId,
        network: "eip155:84532",
        now: new Date("2026-07-17T00:02:00.000Z"),
        receiptId: identity.baseSepoliaReceiptId,
        reservedAtomic: "1000",
      }),
    );

    expect(notification.metadata).toEqual({
      availableAtomic: "0",
      network: "eip155:84532",
      reservedAtomic: "1000",
      testFunds: true,
      testFundsLabel: "Test funds — not real money",
    });
  });
});
