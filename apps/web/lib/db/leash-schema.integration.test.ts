import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  authorization,
  baseSepoliaUsdc,
  baseUsdc,
  createCycle,
  createOwnerAgent,
  insertReceipt,
  sql,
} from "./leash-schema.integration-support";

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
          'receipts', 'floats', 'agent_events', 'x402_resource_settlements'
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
      "x402_resource_settlements",
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

  it("defaults existing agents to mainnet and persists an explicit isolated testnet profile", async () => {
    const mainnet = await createOwnerAgent("mainnet-profile");
    const [owner] = await sql<{ id: string }[]>`
      insert into users (email, magic_issuer)
      values (${`integration-${randomUUID()}@example.test`}, ${`did:ethr:${randomUUID()}`})
      returning id
    `;
    if (!owner) throw new Error("Expected owner");
    const [integration] = await sql<{ id: string }[]>`
      insert into agents (owner_id, name, status, signer_subject, payment_profile)
      values (
        ${owner.id}, 'Integration agent', 'provisioned',
        ${`leash:${randomUUID()}`}, 'base_sepolia_integration'
      )
      returning id
    `;
    if (!integration) throw new Error("Expected integration agent");

    const rows = await sql<{ id: string; payment_profile: string }[]>`
      select id, payment_profile from agents
      where id in (${mainnet.agentId}, ${integration.id})
      order by payment_profile
    `;
    expect(rows).toEqual([
      { id: mainnet.agentId, payment_profile: "mainnet" },
      { id: integration.id, payment_profile: "base_sepolia_integration" },
    ]);
    const integrationCycle = await createCycle(integration.id);
    await expect(
      insertReceipt(integration.id, integrationCycle, {
        asset: baseSepoliaUsdc,
        network: "eip155:84532",
      }),
    ).resolves.toHaveLength(1);
    await expect(
      insertReceipt(integration.id, integrationCycle, {
        asset: baseUsdc,
        network: "eip155:84532",
      }),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      sql`update agents set payment_profile = 'unknown' where id = ${integration.id}`,
    ).rejects.toMatchObject({ code: "22P02" });
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
      update receipts set settlement_response = '{}'::jsonb where status = 'settled'
    `).rejects.toMatchObject({ code: "23514" });
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
});
