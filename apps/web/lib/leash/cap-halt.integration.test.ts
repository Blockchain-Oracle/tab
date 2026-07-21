import { randomBytes, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import { agentEvents, notifications, receipts } from "../db/schema";
import { readOwnerCap, resetOwnerCapCycle, setOwnerCap } from "./cap-policy";
import { completePreSigningChecks, reserveSignRequest } from "./sign-store";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for cap-halt integration tests");

const connection = createDatabase(databaseUrl, 4);
const agentAddress = "0x2222222222222222222222222222222222222222";
const payTo = "0x1111111111111111111111111111111111111111";
const baseUsdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const nowSeconds = 1_784_271_300;

beforeEach(async () => {
  await connection.client`truncate table users cascade`;
});

afterAll(async () => {
  await connection.client.end();
});

async function provision(capCents = "100") {
  const [owner] = await connection.client<{ id: string }[]>`
    insert into users (email, magic_issuer)
    values (${`${randomUUID()}@example.test`}, ${`did:ethr:${randomUUID()}`}) returning id
  `;
  if (!owner) throw new Error("Expected owner");
  const [agent] = await connection.client<{ id: string }[]>`
    insert into agents (owner_id, name, signer_subject, agent_address)
    values (${owner.id}, 'Cap halt test', ${`leash:${randomUUID()}`}, ${agentAddress}) returning id
  `;
  if (!agent) throw new Error("Expected agent");
  const [key] = await connection.client<{ id: string }[]>`
    insert into leash_keys (agent_id, hashed_key, prefix, last4)
    values (${agent.id}, ${randomBytes(32).toString("hex")}, 'agent_sk_', 'a1B2') returning id
  `;
  const [cycle] = await connection.client<{ id: string }[]>`
    insert into cap_cycles (agent_id, started_at)
    values (${agent.id}, ${new Date((nowSeconds - 60) * 1_000).toISOString()}::timestamptz)
    returning id
  `;
  if (!key || !cycle) throw new Error("Expected cap halt identity");
  await connection.client`
    insert into caps (agent_id, amount_usd_cents, frequency)
    values (${agent.id}, ${capCents}, 'daily')
  `;
  return { agentId: agent.id, cycleId: cycle.id, keyId: key.id, ownerId: owner.id };
}

function signBody(amount: string) {
  return {
    amount,
    asset: baseUsdc,
    network: "eip155:8453",
    origin: { clientName: "Claude Code", toolName: "search", transport: "mcp" },
    payTo,
    resourceUrl: "https://durable.vendor.test/pay",
    signerRequest: {
      domain: {
        chainId: 8453,
        name: "USD Coin",
        verifyingContract: baseUsdc,
        version: "2",
      },
      message: {
        from: agentAddress,
        nonce: `0x${randomBytes(32).toString("hex")}`,
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

function reserve(identity: Awaited<ReturnType<typeof provision>>, amount: string, offset: number) {
  return reserveSignRequest(connection.db, {
    ...identity,
    body: signBody(amount),
    nowSeconds: nowSeconds + offset,
  });
}

describe("durable cap halt with real PostgreSQL", () => {
  it("blocks fitting attempts until a sufficient raise or cycle reset", async () => {
    const identity = await provision();
    const committed = await reserve(identity, "800000", 0);
    const firstBlocked = await reserve(identity, "300000", 1);
    const fittingButHalted = await reserve(identity, "100000", 2);
    expect([committed.kind, firstBlocked.kind, fittingButHalted.kind]).toEqual([
      "pending",
      "blocked",
      "blocked",
    ]);
    await expect(
      readOwnerCap(connection.db, {
        agentId: identity.agentId,
        now: new Date((nowSeconds + 3) * 1_000),
        ownerId: identity.ownerId,
      }),
    ).resolves.toMatchObject({ halted: true, spend: { committedAtomic: "800000" } });

    const same = await setOwnerCap(connection.db, {
      ...identity,
      amountUsdCents: "100",
      frequency: "daily",
      now: new Date((nowSeconds + 4) * 1_000),
    });
    const lower = await setOwnerCap(connection.db, {
      ...identity,
      amountUsdCents: "90",
      frequency: "daily",
      now: new Date((nowSeconds + 5) * 1_000),
    });
    const stillBlocked = await reserve(identity, "10000", 6);
    expect([same.halted, lower.halted, stillBlocked.kind]).toEqual([true, true, "blocked"]);

    const raised = await setOwnerCap(connection.db, {
      ...identity,
      amountUsdCents: "110",
      frequency: "daily",
      now: new Date((nowSeconds + 7) * 1_000),
    });
    const resumed = await reserve(identity, "100000", 8);
    expect([raised.halted, resumed.kind]).toEqual([false, "pending"]);

    expect((await reserve(identity, "300000", 9)).kind).toBe("blocked");
    const reset = await resetOwnerCapCycle(connection.db, {
      ...identity,
      now: new Date((nowSeconds + 10) * 1_000),
    });
    const resumedAfterReset = await reserve(identity, "100000", 11);
    expect([reset.halted, resumedAfterReset.kind]).toEqual([false, "pending"]);

    const capBlocks = await connection.db
      .select({ resolvedAt: notifications.resolvedAt })
      .from(notifications)
      .where(eq(notifications.type, "cap_blocked"));
    expect(capBlocks).toHaveLength(2);
    expect(capBlocks.every((item) => item.resolvedAt !== null)).toBe(true);
    const stored = await connection.db
      .select({ amountAtomic: receipts.amountAtomic, status: receipts.status })
      .from(receipts);
    expect(stored.filter((receipt) => receipt.status === "blocked")).toHaveLength(4);
    expect(
      stored
        .filter((receipt) => receipt.status === "pending")
        .map((receipt) => receipt.amountAtomic)
        .sort(),
    ).toEqual(["100000", "100000", "800000"]);
  });

  it("blocks a pre-halt reservation at the final pre-sign gate", async () => {
    const identity = await provision();
    const first = await reserve(identity, "400000", 0);
    if (first.kind !== "pending") throw new Error("Expected first reservation");
    const openingBlock = await reserve(identity, "700000", 1);
    expect(openingBlock.kind).toBe("blocked");

    await expect(
      completePreSigningChecks(connection.db, {
        ...identity,
        liveBalanceAtomic: BigInt(10_000_000),
        nowSeconds: nowSeconds + 2,
        receiptId: first.receiptId,
        signerAvailable: true,
      }),
    ).resolves.toMatchObject({ code: "CAP_EXCEEDED", kind: "blocked" });
    const [stored] = await connection.db
      .select({
        intendedNetwork: receipts.intendedNetwork,
        reason: receipts.reason,
        settlementResponse: receipts.settlementResponse,
        settledAt: receipts.settledAt,
        status: receipts.status,
        txHash: receipts.txHash,
      })
      .from(receipts)
      .where(eq(receipts.id, first.receiptId));
    expect(stored).toEqual({
      intendedNetwork: "eip155:8453",
      reason: "CAP_EXCEEDED",
      settlementResponse: null,
      settledAt: null,
      status: "blocked",
      txHash: null,
    });
    const capBlocks = await connection.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.type, "cap_blocked"));
    expect(capBlocks).toHaveLength(1);
    const blockEvents = await connection.db
      .select({ metadata: agentEvents.metadata })
      .from(agentEvents)
      .where(eq(agentEvents.type, "block"));
    expect(blockEvents.map((event) => event.metadata?.receiptId).sort()).toEqual(
      [first.receiptId, openingBlock.receiptId].sort(),
    );
  });
});
