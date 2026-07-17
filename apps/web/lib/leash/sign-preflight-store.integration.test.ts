import { randomBytes, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase, type Database } from "../db/client";
import { notifications } from "../db/schema";
import {
  completePreSigningChecks,
  failSignRequestBeforeSigning,
  reserveSignRequest,
} from "./sign-store";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for sign preflight tests");

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

async function provision(capCents = "200") {
  const [owner] = await connection.client<{ id: string }[]>`
    insert into users (email, magic_issuer)
    values (${`${randomUUID()}@example.test`}, ${`did:ethr:${randomUUID()}`})
    returning id
  `;
  if (!owner) throw new Error("Expected owner");
  const [agent] = await connection.client<{ id: string }[]>`
    insert into agents (owner_id, name, signer_subject, agent_address)
    values (${owner.id}, 'Preflight test', ${`leash:${randomUUID()}`}, ${agentAddress})
    returning id
  `;
  if (!agent) throw new Error("Expected agent");
  const [key] = await connection.client<{ id: string }[]>`
    insert into leash_keys (agent_id, hashed_key, prefix, last4)
    values (${agent.id}, ${randomBytes(32).toString("hex")}, 'leash_sk_', 'a1B2')
    returning id
  `;
  const [cycle] = await connection.client<{ id: string }[]>`
    insert into cap_cycles (agent_id, started_at)
    values (${agent.id}, now() - interval '1 minute') returning id
  `;
  if (!key || !cycle) throw new Error("Expected agent policy identity");
  await connection.client`
    insert into caps (agent_id, amount_usd_cents, frequency)
    values (${agent.id}, ${capCents}, 'daily')
  `;
  return { agentId: agent.id, cycleId: cycle.id, keyId: key.id };
}

function signBody(amount: string, validBefore = nowSeconds + 300) {
  return {
    amount,
    asset: baseUsdc,
    network: "eip155:8453",
    origin: { clientName: "Claude Code", toolName: "search", transport: "mcp" },
    payTo,
    resourceUrl: "mcp://tool/search",
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
        validBefore: String(validBefore),
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

async function reserve(
  identity: Awaited<ReturnType<typeof provision>>,
  amount: string,
  validBefore?: number,
) {
  const result = await reserveSignRequest(connection.db, {
    ...identity,
    body: signBody(amount, validBefore),
    nowSeconds,
  });
  if (result.kind !== "pending") throw new Error("Expected pending reservation");
  return result;
}

async function rollCycle(identity: Awaited<ReturnType<typeof provision>>) {
  await connection.client`
    update cap_cycles set ended_at = now(), reset_reason = 'manual'
    where id = ${identity.cycleId}
  `;
  const [cycle] = await connection.client<{ id: string }[]>`
    insert into cap_cycles (agent_id, started_at)
    values (${identity.agentId}, now()) returning id
  `;
  if (!cycle) throw new Error("Expected replacement cycle");
  return { ...identity, cycleId: cycle.id };
}

function finalCheck(
  identity: Awaited<ReturnType<typeof provision>>,
  receiptId: string,
  liveBalanceAtomic = BigInt(10_000_000),
  checkedAt = nowSeconds,
) {
  return completePreSigningChecks(connection.db, {
    ...identity,
    liveBalanceAtomic,
    nowSeconds: checkedAt,
    receiptId,
    signerAvailable: true,
  });
}

function floatNotifications() {
  return connection.db.select().from(notifications).where(eq(notifications.type, "float_empty"));
}

describe("final hosted-signer policy decision", () => {
  it("fails a reservation when the cap is lowered during the RPC gap", async () => {
    const identity = await provision("100");
    const pending = await reserve(identity, "600000");
    await connection.client`
      update caps set amount_usd_cents = 50 where agent_id = ${identity.agentId}
    `;

    await expect(finalCheck(identity, pending.receiptId)).resolves.toMatchObject({
      code: "LEASH_CAP_EXCEEDED",
      kind: "blocked",
    });
  });

  it("fails an old-cycle reservation instead of signing it after a reset", async () => {
    const identity = await provision();
    const pending = await reserve(identity, "250000");
    await rollCycle(identity);

    await expect(finalCheck(identity, pending.receiptId)).resolves.toMatchObject({
      code: "CAP_CYCLE_CHANGED",
      kind: "failed",
    });
  });

  it("counts pending float reservations across cap-cycle boundaries", async () => {
    const identity = await provision();
    await reserve(identity, "600000");
    const current = await rollCycle(identity);
    const pending = await reserve(current, "600000");

    await expect(finalCheck(current, pending.receiptId, BigInt(1_000_000))).resolves.toMatchObject({
      code: "FLOAT_EMPTY",
      kind: "failed",
    });
    const [event] = await floatNotifications();
    expect(event).toMatchObject({
      cycleId: current.cycleId,
      eventKey: `float_empty:${current.cycleId}:eip155:8453`,
      metadata: {
        availableAtomic: "1000000",
        network: "eip155:8453",
        reservedAtomic: "1200000",
      },
      receiptId: pending.receiptId,
      sticky: false,
      tier: "2",
    });
  });

  it("drops an expired pending authorization from live float liability", async () => {
    const identity = await provision("300");
    await reserve(identity, "600000", nowSeconds + 1);
    const current = await reserve(identity, "600000");

    await expect(
      finalCheck(identity, current.receiptId, BigInt(600_000), nowSeconds + 2),
    ).resolves.toMatchObject({ kind: "ready" });
  });

  it("deduplicates concurrent and replayed float-empty failures once per cycle", async () => {
    const identity = await provision("300");
    const [first, second] = await Promise.all([
      reserve(identity, "600000"),
      reserve(identity, "600000"),
      reserve(identity, "600000"),
    ]);
    if (!first || !second) throw new Error("Expected reservations");

    const results = await Promise.all([
      finalCheck(identity, first.receiptId, BigInt(1_000_000)),
      finalCheck(identity, second.receiptId, BigInt(1_000_000)),
    ]);
    expect(results).toMatchObject([{ code: "FLOAT_EMPTY" }, { code: "FLOAT_EMPTY" }]);
    await expect(finalCheck(identity, first.receiptId, BigInt(1_000_000))).resolves.toMatchObject({
      code: "FLOAT_EMPTY",
    });

    const rows = await floatNotifications();
    expect(rows).toHaveLength(1);
    expect([first.receiptId, second.receiptId]).toContain(rows[0]?.receiptId);
    expect(rows[0]?.metadata).toMatchObject({ reservedAtomic: "1800000" });
  });

  it("does not emit float-empty for signer or balance-check availability failures", async () => {
    const identity = await provision();
    const signerFailure = await reserve(identity, "250000");
    const checkFailure = await reserve(identity, "250000");

    await expect(
      completePreSigningChecks(connection.db, {
        ...identity,
        liveBalanceAtomic: BigInt(10_000_000),
        nowSeconds,
        receiptId: signerFailure.receiptId,
        signerAvailable: false,
      }),
    ).resolves.toMatchObject({ code: "SIGNER_NOT_CONFIGURED" });
    await expect(
      failSignRequestBeforeSigning(connection.db, {
        agentId: identity.agentId,
        reason: "FLOAT_CHECK_UNAVAILABLE",
        receiptId: checkFailure.receiptId,
      }),
    ).resolves.toMatchObject({ code: "FLOAT_CHECK_UNAVAILABLE" });
    expect(await floatNotifications()).toEqual([]);
  });

  it("rolls the failed receipt and float-empty notification back together", async () => {
    const identity = await provision();
    const pending = await reserve(identity, "600000");
    await reserve(identity, "600000");

    await expect(
      connection.db.transaction(async (transaction) => {
        await completePreSigningChecks(transaction as unknown as Database, {
          ...identity,
          liveBalanceAtomic: BigInt(1_000_000),
          nowSeconds,
          receiptId: pending.receiptId,
          signerAvailable: true,
        });
        const inside = await transaction
          .select()
          .from(notifications)
          .where(eq(notifications.type, "float_empty"));
        expect(inside).toHaveLength(1);
        throw new Error("rollback float decision");
      }),
    ).rejects.toThrow("rollback float decision");

    const [stored] = await connection.client<{ status: string }[]>`
      select status from receipts where id = ${pending.receiptId}
    `;
    expect(stored?.status).toBe("pending");
    expect(await floatNotifications()).toEqual([]);
  });

  it("rechecks authorization expiry immediately before signing", async () => {
    const identity = await provision();
    const pending = await reserve(identity, "250000", nowSeconds + 1);

    await expect(
      finalCheck(identity, pending.receiptId, undefined, nowSeconds + 2),
    ).resolves.toMatchObject({
      code: "AUTHORIZATION_EXPIRED",
      kind: "failed",
    });
  });
});
