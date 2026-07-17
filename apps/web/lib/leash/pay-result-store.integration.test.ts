import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createDatabase, type Database } from "../db/client";
import { notifications } from "../db/schema";
import { applySettlementObservation, SettlementResultConflictError } from "./pay-result-store";
import { parseSettlementObservation } from "./settlement-evidence";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for pay-result tests");
const connection = createDatabase(databaseUrl, 2);
const agentAddress = "0x2222222222222222222222222222222222222222";
const payTo = "0x1111111111111111111111111111111111111111";
const baseUsdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const nonce = `0x${"12".repeat(32)}` as const;
const transaction = `0x${"ab".repeat(32)}` as const;

beforeEach(async () => {
  await connection.client`truncate table users cascade`;
});

afterAll(async () => {
  await connection.client.end();
});

async function pendingReceipt(options: { amountAtomic?: string; capCents?: string } = {}) {
  const [owner] = await connection.client<{ id: string }[]>`
    insert into users (email, magic_issuer)
    values (${`${randomUUID()}@example.test`}, ${`did:ethr:${randomUUID()}`}) returning id
  `;
  if (!owner) throw new Error("Expected owner");
  const [agent] = await connection.client<{ id: string }[]>`
    insert into agents (owner_id, name, signer_subject, agent_address)
    values (${owner.id}, 'Result test', ${`leash:${randomUUID()}`}, ${agentAddress}) returning id
  `;
  if (!agent) throw new Error("Expected agent");
  const [cycle] = await connection.client<{ id: string }[]>`
    insert into cap_cycles (agent_id, started_at)
    values (${agent.id}, now() - interval '1 minute') returning id
  `;
  if (!cycle) throw new Error("Expected cycle");
  await connection.client`
    insert into caps (agent_id, amount_usd_cents, frequency)
    values (${agent.id}, ${options.capCents ?? "100"}, 'daily')
  `;
  const amountAtomic = options.amountAtomic ?? "25000";
  const [receipt] = await connection.client<{ id: string }[]>`
    insert into receipts (
      agent_id, cycle_id, amount_atomic, amount_usd, asset, network, pay_to,
      authorization_nonce, request_fingerprint, authorization_valid_before
    ) values (
      ${agent.id}, ${cycle.id}, ${amountAtomic}, ${amountAtomic}::numeric / 1000000,
      ${baseUsdc}, 'eip155:8453',
      ${payTo}, ${nonce}, ${randomBytes(32).toString("hex")}, now() + interval '5 minutes'
    ) returning id
  `;
  if (!receipt) throw new Error("Expected receipt");
  return { agentId: agent.id, cycleId: cycle.id, receiptId: receipt.id };
}

function observation(receiptId: string, txHash = transaction) {
  return parseSettlementObservation({
    outcome: "observed",
    paymentResponse: {
      network: "eip155:8453",
      payer: agentAddress,
      success: true,
      transaction: txHash,
    },
    receiptId,
  });
}

describe("on-chain verified receipt finalization", () => {
  it("keeps forged but shaped resource evidence pending", async () => {
    const pending = await pendingReceipt();
    const verify = vi.fn(async () => false);

    await expect(
      applySettlementObservation(connection.db, {
        agentId: pending.agentId,
        evidence: observation(pending.receiptId),
        verify,
      }),
    ).resolves.toEqual({ kind: "pending", receiptId: pending.receiptId, verified: false });
    const [stored] = await connection.client<{ status: string; tx_hash: string | null }[]>`
      select status, tx_hash from receipts where id = ${pending.receiptId}
    `;
    expect(stored).toEqual({ status: "pending", tx_hash: null });
    expect(verify).toHaveBeenCalledOnce();
  });

  it("settles only after proof and makes identical callbacks idempotent", async () => {
    const pending = await pendingReceipt();
    const verify = vi.fn(async () => true);
    const evidence = observation(pending.receiptId);

    await expect(
      applySettlementObservation(connection.db, { agentId: pending.agentId, evidence, verify }),
    ).resolves.toEqual({ kind: "settled", receiptId: pending.receiptId, verified: true });
    await expect(
      applySettlementObservation(connection.db, { agentId: pending.agentId, evidence, verify }),
    ).resolves.toEqual({ kind: "settled", receiptId: pending.receiptId, verified: true });

    const [stored] = await connection.client<
      {
        settlement_response: Record<string, unknown>;
        status: string;
        tx_hash: string;
      }[]
    >`select status, tx_hash, settlement_response from receipts where id = ${pending.receiptId}`;
    expect(stored).toMatchObject({
      settlement_response: { proof: "usdc_transfer_and_authorization_used" },
      status: "settled",
      tx_hash: transaction,
    });
    expect(verify).toHaveBeenCalledOnce();
    expect(await connection.db.select().from(notifications)).toEqual([]);
  });

  it("emits cap_75 once per cycle after concurrent verified finalization", async () => {
    const pending = await pendingReceipt({ amountAtomic: "750000" });
    const evidence = observation(pending.receiptId);

    const results = await Promise.all([
      applySettlementObservation(connection.db, {
        agentId: pending.agentId,
        evidence,
        verify: async () => true,
      }),
      applySettlementObservation(connection.db, {
        agentId: pending.agentId,
        evidence,
        verify: async () => true,
      }),
    ]);

    expect(results).toEqual([
      { kind: "settled", receiptId: pending.receiptId, verified: true },
      { kind: "settled", receiptId: pending.receiptId, verified: true },
    ]);
    const rows = await connection.db.select().from(notifications);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      cycleId: pending.cycleId,
      eventKey: `cap_75:${pending.cycleId}`,
      metadata: {
        capAtomic: "1000000",
        committedAtomic: "750000",
        thresholdPercent: 75,
      },
      sticky: false,
      tier: "2",
      type: "cap_75",
    });
  });

  it("rolls verified settlement and its threshold notification back together", async () => {
    const pending = await pendingReceipt({ amountAtomic: "750000" });

    await expect(
      connection.db.transaction(async (transaction) => {
        const result = await applySettlementObservation(transaction as unknown as Database, {
          agentId: pending.agentId,
          evidence: observation(pending.receiptId),
          verify: async () => true,
        });
        expect(result.kind).toBe("settled");
        expect(await transaction.select().from(notifications)).toHaveLength(1);
        throw new Error("rollback settlement");
      }),
    ).rejects.toThrow("rollback settlement");

    const [stored] = await connection.client<{ status: string }[]>`
      select status from receipts where id = ${pending.receiptId}
    `;
    expect(stored?.status).toBe("pending");
    expect(await connection.db.select().from(notifications)).toEqual([]);
  });

  it("scopes observations to the authenticated agent and rejects conflicting final evidence", async () => {
    const pending = await pendingReceipt();
    await expect(
      applySettlementObservation(connection.db, {
        agentId: randomUUID(),
        evidence: observation(pending.receiptId),
        verify: async () => true,
      }),
    ).resolves.toEqual({ kind: "not_found" });

    const evidence = observation(pending.receiptId);
    await applySettlementObservation(connection.db, {
      agentId: pending.agentId,
      evidence,
      verify: async () => true,
    });
    await expect(
      applySettlementObservation(connection.db, {
        agentId: pending.agentId,
        evidence: observation(pending.receiptId, `0x${"cd".repeat(32)}`),
        verify: async () => true,
      }),
    ).rejects.toBeInstanceOf(SettlementResultConflictError);
  });
});
