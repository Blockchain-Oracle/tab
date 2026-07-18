import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, beforeEach } from "vitest";

import { createDatabase } from "../db/client";
import { revokeOwnerAgent } from "./revoke-store";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for sign-store tests");

export const connection = createDatabase(databaseUrl, 4);
const agentAddress = "0x2222222222222222222222222222222222222222";
const payTo = "0x1111111111111111111111111111111111111111";
const baseUsdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const nowSeconds = 1_784_271_300;

beforeEach(async () => {
  await connection.client`truncate table users cascade`;
});

afterAll(async () => {
  await connection.client.end();
});

export async function provision(
  options: {
    capCents?: string | null;
    status?: "provisioned" | "paused" | "frozen" | "cancelled" | "nuked";
  } = {},
) {
  const status = options.status ?? "provisioned";
  const initialStatus = status === "cancelled" || status === "nuked" ? "provisioned" : status;
  const [owner] = await connection.client<{ id: string }[]>`
    insert into users (email, magic_issuer)
    values (${`${randomUUID()}@example.test`}, ${`did:ethr:${randomUUID()}`})
    returning id
  `;
  if (!owner) throw new Error("Expected an owner");
  const [agent] = await connection.client<{ id: string }[]>`
    insert into agents (owner_id, name, status, signer_subject, agent_address)
    values (
      ${owner.id}, 'Sign test', ${initialStatus},
      ${`leash:${randomUUID()}`}, ${agentAddress}
    ) returning id
  `;
  if (!agent) throw new Error("Expected an agent");
  const [key] = await connection.client<{ id: string }[]>`
    insert into leash_keys (agent_id, hashed_key, prefix, last4)
    values (${agent.id}, ${randomBytes(32).toString("hex")}, 'leash_sk_', 'a1B2')
    returning id
  `;
  const [cycle] = await connection.client<{ id: string }[]>`
    insert into cap_cycles (agent_id, started_at)
    values (${agent.id}, now() - interval '1 minute') returning id
  `;
  if (!key || !cycle) throw new Error("Expected key and cycle");
  if (options.capCents !== null) {
    await connection.client`
      insert into caps (agent_id, amount_usd_cents, frequency)
      values (${agent.id}, ${options.capCents ?? "100"}, 'daily')
    `;
  }
  if (status === "cancelled" || status === "nuked") {
    await revokeOwnerAgent(connection.db, {
      action: status === "cancelled" ? "cancel" : "nuclear",
      actorSurface: "web",
      agentId: agent.id,
      confirmation: status === "cancelled" ? "CANCEL" : "Sign test",
      ownerId: owner.id,
    });
  }
  return { agentId: agent.id, cycleId: cycle.id, keyId: key.id, ownerId: owner.id };
}

export function signBody(amount = "250000", nonce = randomBytes(32).toString("hex")) {
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

export async function insertCommitted(
  agentId: string,
  cycleId: string,
  status: "pending" | "settled" | "failed" | "blocked",
  amount: string,
) {
  const terminal = status === "settled";
  const blocked = status === "blocked";
  const transaction = terminal ? `0x${randomBytes(32).toString("hex")}` : null;
  await connection.client`
    insert into receipts (
      agent_id, cycle_id, status, reason, amount_atomic, amount_usd, asset, network,
      intended_network, pay_to, authorization_nonce, request_fingerprint,
      authorization_valid_before, origin, tx_hash, settlement_response, settled_at
    ) values (
      ${agentId}, ${cycleId}, ${status},
      ${status === "failed" ? "FLOAT_EMPTY" : blocked ? "LEASH_CAP_EXCEEDED" : null},
      ${amount}, ${amount}::numeric / 1000000, ${baseUsdc}, 'eip155:8453',
      ${blocked ? "eip155:8453" : null}, ${payTo},
      ${`0x${randomBytes(32).toString("hex")}`}, ${randomBytes(32).toString("hex")},
      now() + interval '5 minutes', null, ${transaction},
      ${terminal ? JSON.stringify({ success: true, transaction }) : null}::jsonb,
      ${terminal ? new Date().toISOString() : null}::timestamptz
    )
  `;
}

export async function insertRevertedAuthorization(
  agentId: string,
  cycleId: string,
  amount: string,
  validBeforeSeconds: number,
) {
  const transaction = `0x${randomBytes(32).toString("hex")}`;
  await connection.client`
    insert into receipts (
      agent_id, cycle_id, status, reason, amount_atomic, amount_usd, asset, network,
      pay_to, authorization_nonce, request_fingerprint, authorization_valid_before,
      tx_hash, settlement_response
    ) values (
      ${agentId}, ${cycleId}, 'failed', 'invalid_exact_evm_transaction_failed', ${amount},
      ${amount}::numeric / 1000000, ${baseUsdc}, 'eip155:8453', ${payTo},
      ${`0x${randomBytes(32).toString("hex")}`}, ${randomBytes(32).toString("hex")},
      to_timestamp(${validBeforeSeconds}), ${transaction},
      ${JSON.stringify({ success: false, transaction })}::jsonb
    )
  `;
}
