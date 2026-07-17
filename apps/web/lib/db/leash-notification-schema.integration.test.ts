import { randomBytes, randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for notification schema tests");

const sql = postgres(databaseUrl, { max: 1 });
const baseUsdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const payTo = "0x1111111111111111111111111111111111111111";

async function identity(label: string) {
  const [owner] = await sql<{ id: string }[]>`
    insert into users (email, magic_issuer)
    values (${`${label}-${randomUUID()}@example.test`}, ${`did:ethr:${randomUUID()}`})
    returning id
  `;
  if (!owner) throw new Error("Expected owner");
  const [agent] = await sql<{ id: string }[]>`
    insert into agents (owner_id, name, signer_subject)
    values (${owner.id}, ${`Agent ${label}`}, ${`leash:${randomUUID()}`})
    returning id
  `;
  if (!agent) throw new Error("Expected agent");
  const [cycle] = await sql<{ id: string }[]>`
    insert into cap_cycles (agent_id, started_at)
    values (${agent.id}, now() - interval '1 minute')
    returning id
  `;
  if (!cycle) throw new Error("Expected cycle");
  return { agentId: agent.id, cycleId: cycle.id, ownerId: owner.id };
}

async function receipt(agentId: string, cycleId: string) {
  const [row] = await sql<{ id: string }[]>`
    insert into receipts (
      agent_id, cycle_id, amount_atomic, amount_usd, asset, network, pay_to,
      authorization_nonce, request_fingerprint, authorization_valid_before
    ) values (
      ${agentId}, ${cycleId}, 25000, 0.025, ${baseUsdc}, 'eip155:8453', ${payTo},
      ${`0x${randomBytes(32).toString("hex")}`}, ${randomBytes(32).toString("hex")},
      now() + interval '5 minutes'
    )
    returning id
  `;
  if (!row) throw new Error("Expected receipt");
  return row.id;
}

beforeEach(async () => {
  await sql`truncate table users cascade`;
});

afterAll(async () => {
  await sql.end();
});

describe("Phase 7 notification and resource schema", () => {
  it("keeps legacy receipts nullable while requiring a normalized resource pair", async () => {
    const owner = await identity("resource");
    const receiptId = await receipt(owner.agentId, owner.cycleId);

    await expect(sql`
      update receipts set resource_url = 'https://api.example.test/paid'
      where id = ${receiptId}
    `).rejects.toMatchObject({ code: "23514" });
    await sql`
      update receipts
      set resource_url = 'https://api.example.test/paid', resource_host = 'api.example.test'
      where id = ${receiptId}
    `;
    await expect(sql`
      update receipts set resource_host = 'API.example.test' where id = ${receiptId}
    `).rejects.toMatchObject({ code: "23514" });

    const [stored] = await sql<{ resource_host: string; resource_url: string }[]>`
      select resource_url, resource_host from receipts where id = ${receiptId}
    `;
    expect(stored).toEqual({
      resource_host: "api.example.test",
      resource_url: "https://api.example.test/paid",
    });
  });

  it("stores only canonical tier/type combinations with object metadata", async () => {
    const owner = await identity("canonical");
    const [enumValues] = await sql<{ tiers: string[]; types: string[] }[]>`
      select
        enum_range(null::notification_tier)::text[] as tiers,
        enum_range(null::notification_type)::text[] as types
    `;
    expect(enumValues).toEqual({
      tiers: ["2", "3"],
      types: [
        "cap_75",
        "cap_blocked",
        "unusual_domain",
        "cap_lowered_halt",
        "float_low",
        "float_empty",
      ],
    });

    await sql`
      insert into notifications (
        agent_id, cycle_id, tier, type, event_key, metadata, sticky
      ) values (
        ${owner.agentId}, ${owner.cycleId}, '2', 'cap_75', 'cap-75:first',
        ${sql.json({ percent: 75 })}, false
      )
    `;

    await expect(sql`
      insert into notifications (
        agent_id, cycle_id, tier, type, event_key, metadata, sticky
      ) values (
        ${owner.agentId}, ${owner.cycleId}, '3', 'float_empty', 'invalid:tier',
        ${sql.json({})}, true
      )
    `).rejects.toMatchObject({ code: "23514" });
    await expect(sql`
      insert into notifications (
        agent_id, cycle_id, tier, type, event_key, metadata, sticky
      ) values (
        ${owner.agentId}, ${owner.cycleId}, '2', 'float_low', 'invalid:metadata',
        ${sql.json([])}, false
      )
    `).rejects.toMatchObject({ code: "23514" });

    const rows = await sql<{ tier: string; type: string }[]>`
      select tier::text, type::text from notifications
    `;
    expect(rows).toEqual([{ tier: "2", type: "cap_75" }]);
  });

  it("deduplicates threshold, domain, and unresolved cap-halt episodes", async () => {
    const owner = await identity("dedupe");
    const resourceKey = "a".repeat(64);
    await sql`
      insert into notifications (agent_id, cycle_id, tier, type, event_key, metadata, sticky)
      values (${owner.agentId}, ${owner.cycleId}, '2', 'cap_75', 'cap:first', '{}', false)
    `;
    await expect(sql`
      insert into notifications (agent_id, cycle_id, tier, type, event_key, metadata, sticky)
      values (${owner.agentId}, ${owner.cycleId}, '2', 'cap_75', 'cap:replay', '{}', false)
    `).rejects.toMatchObject({ code: "23505" });

    await sql`
      insert into notifications (
        agent_id, cycle_id, tier, type, event_key, metadata, resource_host, resource_key, sticky
      ) values (
        ${owner.agentId}, ${owner.cycleId}, '2', 'unusual_domain', 'domain:first', '{}',
        'api.example.test', ${resourceKey}, false
      )
    `;
    await expect(sql`
      insert into notifications (
        agent_id, cycle_id, tier, type, event_key, metadata, resource_host, resource_key, sticky
      ) values (
        ${owner.agentId}, ${owner.cycleId}, '2', 'unusual_domain', 'domain:replay', '{}',
        'different.example.test', ${resourceKey}, false
      )
    `).rejects.toMatchObject({ code: "23505" });
    await sql`
      insert into notifications (
        agent_id, cycle_id, tier, type, event_key, metadata, resource_host, resource_key, sticky
      ) values (
        ${owner.agentId}, ${owner.cycleId}, '2', 'unusual_domain', 'domain:second-resource', '{}',
        'api.example.test', ${"c".repeat(64)}, false
      )
    `;
    await expect(sql`
      insert into notifications (
        agent_id, cycle_id, tier, type, event_key, metadata, resource_host, sticky
      ) values (
        ${owner.agentId}, ${owner.cycleId}, '2', 'unusual_domain', 'domain:missing-key', '{}',
        'missing.example.test', false
      )
    `).rejects.toMatchObject({ code: "23514" });

    const [active] = await sql<{ id: string }[]>`
      insert into notifications (agent_id, cycle_id, tier, type, event_key, metadata, sticky)
      values (${owner.agentId}, ${owner.cycleId}, '3', 'cap_blocked', 'halt:first', '{}', true)
      returning id
    `;
    if (!active) throw new Error("Expected active halt notification");
    await expect(sql`
      insert into notifications (agent_id, cycle_id, tier, type, event_key, metadata, sticky)
      values (
        ${owner.agentId}, ${owner.cycleId}, '3', 'cap_lowered_halt', 'halt:duplicate', '{}', true
      )
    `).rejects.toMatchObject({ code: "23505" });
    await sql`update notifications set resolved_at = now() where id = ${active.id}`;
    await sql`
      insert into notifications (agent_id, cycle_id, tier, type, event_key, metadata, sticky)
      values (
        ${owner.agentId}, ${owner.cycleId}, '3', 'cap_lowered_halt', 'halt:new', '{}', true
      )
    `;
  });

  it("prevents a notification from linking another agent's receipt", async () => {
    const first = await identity("receipt-first");
    const second = await identity("receipt-second");
    const receiptId = await receipt(first.agentId, first.cycleId);
    const resourceKey = "b".repeat(64);

    await expect(sql`
      insert into notifications (
        agent_id, cycle_id, receipt_id, tier, type, event_key, metadata, resource_host,
        resource_key, sticky
      ) values (
        ${second.agentId}, ${second.cycleId}, ${receiptId}, '2', 'unusual_domain',
        'cross-agent', '{}', 'api.example.test', ${resourceKey}, false
      )
    `).rejects.toMatchObject({ code: "23503" });
    await sql`
      insert into notifications (
        agent_id, cycle_id, receipt_id, tier, type, event_key, metadata, resource_host,
        resource_key, sticky
      ) values (
        ${first.agentId}, ${first.cycleId}, ${receiptId}, '2', 'unusual_domain',
        'owned-receipt', '{}', 'api.example.test', ${resourceKey}, false
      )
    `;
  });

  it("stores owner-scoped push subscriptions with globally unique endpoints", async () => {
    const first = await identity("push-first");
    const second = await identity("push-second");
    await sql`
      insert into push_subscriptions (owner_id, endpoint, p256dh, auth, user_agent)
      values (${first.ownerId}, 'https://push.example.test/one', 'public-key', 'auth-key', 'PWA')
    `;
    await expect(sql`
      insert into push_subscriptions (owner_id, endpoint, p256dh, auth)
      values (${second.ownerId}, 'https://push.example.test/one', 'other-key', 'other-auth')
    `).rejects.toMatchObject({ code: "23505" });
    await expect(sql`
      insert into push_subscriptions (owner_id, endpoint, p256dh, auth)
      values (${second.ownerId}, 'https://push.example.test/two', '', 'auth-key')
    `).rejects.toMatchObject({ code: "23514" });
  });
});
