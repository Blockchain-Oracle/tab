import { randomBytes, randomUUID } from "node:crypto";

import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for agent schema tests");

export const sql = postgres(databaseUrl, { max: 1 });
export const payTo = "0x1111111111111111111111111111111111111111";
export const baseUsdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const arbitrumUsdc = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
export const baseSepoliaUsdc = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

export async function createOwnerAgent(label: string, agentAddress: string | null = null) {
  const [owner] = await sql<{ id: string }[]>`
    insert into users (email, magic_issuer)
    values (${`${label}-${randomUUID()}@example.test`}, ${`did:ethr:${randomUUID()}`})
    returning id
  `;
  if (!owner) throw new Error("Expected an owner row");
  const [agent] = await sql<{ id: string }[]>`
    insert into agents (owner_id, name, status, signer_subject, agent_address)
    values (
      ${owner.id}, ${`Agent ${label}`}, 'provisioned',
      ${`leash:${randomUUID()}`}, ${agentAddress}
    )
    returning id
  `;
  if (!agent) throw new Error("Expected an agent row");
  return { agentId: agent.id, ownerId: owner.id };
}

export async function createCycle(agentId: string) {
  const [cycle] = await sql<{ id: string }[]>`
    insert into cap_cycles (agent_id, started_at)
    values (${agentId}, now() - interval '1 minute')
    returning id
  `;
  if (!cycle) throw new Error("Expected a cap cycle row");
  return cycle.id;
}

export function authorization() {
  return {
    fingerprint: randomBytes(32).toString("hex"),
    nonce: `0x${randomBytes(32).toString("hex")}`,
  };
}

export function insertReceipt(
  agentId: string,
  cycleId: string,
  values: {
    amountAtomic?: string;
    asset?: string;
    fingerprint?: string;
    network?: string;
    nonce?: string;
    reason?: string | null;
    status?: string;
  } = {},
) {
  const auth = authorization();
  const status = values.status ?? "pending";
  const settled = status === "settled";
  const txHash = settled ? `0x${"a".repeat(64)}` : null;
  const blocked = status === "blocked";
  const network = values.network ?? "eip155:8453";
  const asset = values.asset ?? (network === "eip155:42161" ? arbitrumUsdc : baseUsdc);
  const reason = Object.hasOwn(values, "reason")
    ? (values.reason ?? null)
    : blocked
      ? "CAP_EXCEEDED"
      : null;
  return sql`
    insert into receipts (
      agent_id, cycle_id, status, amount_atomic, amount_usd, asset, network,
      pay_to, authorization_nonce, request_fingerprint, authorization_valid_before,
      origin, reason, intended_network, tx_hash, settlement_response, settled_at
    ) values (
      ${agentId}, ${cycleId}, ${status}, ${values.amountAtomic ?? "1000000"}, '1.000000',
      ${asset}, ${network}, ${payTo},
      ${values.nonce ?? auth.nonce}, ${values.fingerprint ?? auth.fingerprint},
      now() + interval '5 minutes',
      ${sql.json({ clientName: "integration", toolName: "pay", transport: "mcp" })},
      ${reason}, ${blocked ? network : null}, ${txHash},
      ${settled ? sql.json({ success: true, transaction: txHash }) : null},
      ${settled ? new Date() : null}
    )
    returning id
  `;
}
