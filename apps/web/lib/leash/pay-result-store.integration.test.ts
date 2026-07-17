import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createDatabase } from "../db/client";
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

async function pendingReceipt() {
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
  const [receipt] = await connection.client<{ id: string }[]>`
    insert into receipts (
      agent_id, cycle_id, amount_atomic, amount_usd, asset, network, pay_to,
      authorization_nonce, request_fingerprint, authorization_valid_before
    ) values (
      ${agent.id}, ${cycle.id}, '25000', '0.025000', ${baseUsdc}, 'eip155:8453',
      ${payTo}, ${nonce}, ${randomBytes(32).toString("hex")}, now() + interval '5 minutes'
    ) returning id
  `;
  if (!receipt) throw new Error("Expected receipt");
  return { agentId: agent.id, receiptId: receipt.id };
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
