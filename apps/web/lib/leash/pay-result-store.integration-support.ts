import { randomBytes, randomUUID } from "node:crypto";

import { createDatabase } from "../db/client";
import { parseSettlementObservation } from "./settlement-evidence";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for pay-result tests");

export const connection = createDatabase(databaseUrl, 2);
const agentAddress = "0x2222222222222222222222222222222222222222";
const payTo = "0x1111111111111111111111111111111111111111";
const baseUsdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const nonce = `0x${"12".repeat(32)}` as const;
export const transaction = `0x${"ab".repeat(32)}` as const;

export async function pendingReceipt(options: { amountAtomic?: string; capCents?: string } = {}) {
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

export function observation(receiptId: string, txHash = transaction) {
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

export function failedObservation(receiptId: string, txHash = transaction) {
  return parseSettlementObservation({
    outcome: "observed",
    paymentResponse: {
      errorReason: "invalid_exact_evm_transaction_failed",
      network: "eip155:8453",
      payer: agentAddress,
      success: false,
      transaction: txHash,
    },
    receiptId,
  });
}
