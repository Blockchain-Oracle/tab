import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  arbitrumUsdc,
  baseSepoliaUsdc,
  baseUsdc,
  createCycle,
  createOwnerAgent,
  insertReceipt,
  sql,
} from "./leash-schema.integration-support";

describe("Phase 6 Leash PostgreSQL ledger constraints", () => {
  beforeEach(async () => {
    await sql`truncate table users cascade`;
  });

  afterAll(() => sql.end());

  it("stores a complete bounded signing lease but rejects partial claim state", async () => {
    const { agentId } = await createOwnerAgent("signing-lease");
    const cycleId = await createCycle(agentId);
    const [receipt] = await insertReceipt(agentId, cycleId);
    if (!receipt) throw new Error("Expected receipt");
    const claimToken = randomBytes(32).toString("hex");
    const digest = `0x${randomBytes(32).toString("hex")}`;

    await sql`
      update receipts
      set signing_claim_token = ${claimToken}, signing_claimed_at = now(),
        signing_lease_expires_at = now() + interval '15 seconds', signing_digest = ${digest},
        signing_attempts = signing_attempts + 1
      where id = ${receipt.id}
    `;
    const [stored] = await sql<
      { signing_attempts: number; signing_claim_token: string; signing_digest: string }[]
    >`
      select signing_attempts, signing_claim_token, signing_digest
      from receipts where id = ${receipt.id}
    `;
    expect(stored).toEqual({
      signing_attempts: 1,
      signing_claim_token: claimToken,
      signing_digest: digest,
    });

    const [second] = await insertReceipt(agentId, cycleId);
    if (!second) throw new Error("Expected second receipt");
    await expect(sql`
      update receipts set signing_claim_token = ${randomBytes(32).toString("hex")}
      where id = ${second.id}
    `).rejects.toMatchObject({ code: "23514" });
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

  it("stores only profile-native USDC float snapshots and owned audit events", async () => {
    const { agentId } = await createOwnerAgent("floats-events");
    await sql`
      insert into floats (agent_id, network, asset, token_address, balance_atomic, balance_usd)
      values
        (${agentId}, 'eip155:8453', 'USDC', ${baseUsdc}, 0, 0),
        (${agentId}, 'eip155:42161', 'USDC', ${arbitrumUsdc}, 1000000, 1),
        (${agentId}, 'eip155:84532', 'USDC', ${baseSepoliaUsdc}, 1000, 0.001)
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
