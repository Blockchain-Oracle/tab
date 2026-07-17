import { randomBytes, randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for Leash schema tests");

const sql = postgres(databaseUrl, { max: 1 });
const payTo = "0x1111111111111111111111111111111111111111";
const baseUsdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const arbitrumUsdc = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

async function createOwnerAgent(label: string, agentAddress: string | null = null) {
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

async function createCycle(agentId: string) {
  const [cycle] = await sql<{ id: string }[]>`
    insert into cap_cycles (agent_id, started_at)
    values (${agentId}, now() - interval '1 minute')
    returning id
  `;
  if (!cycle) throw new Error("Expected a cap cycle row");
  return cycle.id;
}

function authorization() {
  return {
    fingerprint: randomBytes(32).toString("hex"),
    nonce: `0x${randomBytes(32).toString("hex")}`,
  };
}

function insertReceipt(
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
      now() + interval '5 minutes', ${sql.json({ clientName: "integration", toolName: "pay", transport: "mcp" })},
      ${reason},
      ${blocked ? network : null},
      ${settled ? `0x${"a".repeat(64)}` : null},
      ${settled ? sql.json({ success: true }) : null}, ${settled ? new Date() : null}
    )
    returning id
  `;
}

describe("Phase 6 Leash PostgreSQL schema", () => {
  beforeEach(async () => {
    await sql`truncate table users cascade`;
  });

  afterAll(async () => {
    await sql.end();
  });

  it("creates every canonical Leash ledger table", async () => {
    const rows = await sql<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in (
          'agents', 'leash_keys', 'caps', 'cap_cycles',
          'receipts', 'floats', 'agent_events'
        )
      order by table_name
    `;

    expect(rows.map((row) => row.table_name)).toEqual([
      "agent_events",
      "agents",
      "cap_cycles",
      "caps",
      "floats",
      "leash_keys",
      "receipts",
    ]);
  });

  it("keeps B03 wallet provisioning nullable while enforcing owner and agent identity", async () => {
    const { agentId } = await createOwnerAgent("nullable-address");
    const [stored] = await sql<{ agent_address: string | null }[]>`
      select agent_address from agents where id = ${agentId}
    `;
    expect(stored?.agent_address).toBeNull();

    await expect(
      sql`update agents set agent_address = '0x1234' where id = ${agentId}`,
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      sql`update agents set status = 'running' where id = ${agentId}`,
    ).rejects.toMatchObject({ code: "22P02" });
    await expect(sql`
      insert into agents (owner_id, name, status, signer_subject)
      values (${randomUUID()}, 'Orphan', 'provisioned', ${`leash:${randomUUID()}`})
    `).rejects.toMatchObject({ code: "23503" });
  });

  it("enforces one active Leash key, a positive cap, and one active cycle", async () => {
    const { agentId } = await createOwnerAgent("key-cap-cycle");
    const hash = randomBytes(32).toString("hex");
    await sql`
      insert into leash_keys (agent_id, hashed_key, prefix, last4)
      values (${agentId}, ${hash}, 'leash_sk_', 'a1B2')
    `;
    await expect(sql`
      insert into leash_keys (agent_id, hashed_key, prefix, last4)
      values (${agentId}, ${randomBytes(32).toString("hex")}, 'leash_sk_', 'c3D4')
    `).rejects.toMatchObject({ code: "23505" });
    await expect(sql`
      insert into caps (agent_id, amount_usd_cents, frequency)
      values (${agentId}, 0, 'daily')
    `).rejects.toMatchObject({ code: "23514" });

    await sql`
      insert into caps (agent_id, amount_usd_cents, frequency)
      values (${agentId}, 1000, 'daily')
    `;
    await createCycle(agentId);
    await expect(createCycle(agentId)).rejects.toMatchObject({ code: "23505" });
  });

  it("persists only canonical receipt states with replay-safe authorization evidence", async () => {
    const { agentId } = await createOwnerAgent("receipts");
    const cycleId = await createCycle(agentId);
    for (const status of ["pending", "settled", "failed", "blocked"]) {
      await insertReceipt(agentId, cycleId, {
        ...(status === "failed" ? { reason: "SIGNER_NOT_CONFIGURED" } : {}),
        status,
      });
    }
    const rows = await sql<{ status: string }[]>`
      select status from receipts order by status
    `;
    expect(rows.map((row) => row.status)).toEqual(["pending", "settled", "failed", "blocked"]);
    await expect(
      insertReceipt(agentId, cycleId, { network: "eip155:42161" }),
    ).resolves.toHaveLength(1);

    const duplicate = authorization();
    await insertReceipt(agentId, cycleId, duplicate);
    await expect(insertReceipt(agentId, cycleId, { nonce: duplicate.nonce })).rejects.toMatchObject(
      {
        code: "23505",
      },
    );
    await expect(
      insertReceipt(agentId, cycleId, { fingerprint: duplicate.fingerprint }),
    ).rejects.toMatchObject({
      code: "23505",
    });
    await expect(insertReceipt(agentId, cycleId, { amountAtomic: "0" })).rejects.toMatchObject({
      code: "23514",
    });
    await expect(insertReceipt(agentId, cycleId, { amountAtomic: "1.5" })).rejects.toMatchObject({
      code: "23514",
    });
    await expect(insertReceipt(agentId, cycleId, { network: "eip155:137" })).rejects.toMatchObject({
      code: "22P02",
    });
    await expect(
      insertReceipt(agentId, cycleId, {
        asset: "0x3333333333333333333333333333333333333333",
      }),
    ).rejects.toMatchObject({
      code: "23514",
    });
    await sql`update receipts set origin = null where status = 'pending'`;
    await expect(sql`
      update receipts set status = 'settled' where status = 'pending'
    `).rejects.toMatchObject({ code: "23514" });
  });

  it("requires lowercase authorization nonces at the database boundary", async () => {
    const { agentId } = await createOwnerAgent("lowercase-nonce");
    const cycleId = await createCycle(agentId);

    await expect(
      insertReceipt(agentId, cycleId, { nonce: `0x${"AB".repeat(32)}` }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it.each(["failed", "blocked"])("requires a reason for %s receipts", async (status) => {
    const { agentId } = await createOwnerAgent(`${status}-reason`);
    const cycleId = await createCycle(agentId);

    await expect(insertReceipt(agentId, cycleId, { reason: null, status })).rejects.toMatchObject({
      code: "23514",
    });
  });

  it("prevents receipts from borrowing another agent's cycle", async () => {
    const first = await createOwnerAgent("cycle-first");
    const second = await createOwnerAgent("cycle-second");
    const firstCycle = await createCycle(first.agentId);
    await expect(insertReceipt(second.agentId, firstCycle)).rejects.toMatchObject({
      code: "23503",
    });
  });

  it("stores only Base and Arbitrum native-USDC float snapshots and owned audit events", async () => {
    const { agentId } = await createOwnerAgent("floats-events");
    await sql`
      insert into floats (agent_id, network, asset, token_address, balance_atomic, balance_usd)
      values
        (${agentId}, 'eip155:8453', 'USDC', ${baseUsdc}, 0, 0),
        (${agentId}, 'eip155:42161', 'USDC', ${arbitrumUsdc}, 1000000, 1)
    `;
    await expect(sql`
      insert into floats (agent_id, network, asset, token_address, balance_atomic, balance_usd)
      values (${agentId}, 'eip155:137', 'USDC', ${baseUsdc}, 1, 1)
    `).rejects.toMatchObject({ code: "22P02" });
    await expect(sql`
      update floats set token_address = ${arbitrumUsdc}
      where agent_id = ${agentId} and network = 'eip155:8453'
    `).rejects.toMatchObject({ code: "23514" });
    await expect(sql`
      update floats set balance_atomic = -1 where agent_id = ${agentId}
    `).rejects.toMatchObject({ code: "23514" });

    await sql`
      insert into agent_events (agent_id, type, actor_surface, metadata)
      values (${agentId}, 'connect', 'agent', ${sql.json({ clientName: "integration" })})
    `;
    await expect(sql`
      insert into agent_events (agent_id, type, actor_surface)
      values (${randomUUID()}, 'sign', 'system')
    `).rejects.toMatchObject({ code: "23503" });
  });
});
