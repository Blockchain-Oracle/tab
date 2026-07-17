import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import postgres from "postgres";
import { afterAll, afterEach, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for PostgreSQL integration tests");
}

const sql = postgres(databaseUrl, { max: 1 });
const schemas = new Set<string>();
const NETWORK = "eip155:8453";
const ASSET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const AGENT_ADDRESS = "0x1111111111111111111111111111111111111111";
const PAY_TO = "0x2222222222222222222222222222222222222222";
const AMOUNT_ATOMIC = "1000";
const VALID_BEFORE = "2000000000";

function fingerprint(nonce: string) {
  return createHash("sha256")
    .update(
      [NETWORK, ASSET, AGENT_ADDRESS, PAY_TO, AMOUNT_ATOMIC, "0", VALID_BEFORE, nonce].join("\0"),
    )
    .digest("hex");
}

function newSchemaName() {
  return `leash_upgrade_${randomUUID().replaceAll("-", "")}`;
}

async function createLegacyReceiptsSchema(schema: string) {
  await sql.unsafe(`create schema "${schema}"`);
  schemas.add(schema);
  await sql.unsafe(`
    create table "${schema}"."agents" (
      "id" uuid primary key,
      "agent_address" varchar(42)
    );
    create table "${schema}"."receipts" (
      "id" uuid primary key,
      "agent_id" uuid not null,
      "status" text default 'pending' not null,
      "reason" text,
      "intended_network" text,
      "tx_hash" varchar(66),
      "settlement_response" jsonb,
      "settled_at" timestamp with time zone,
      "amount_atomic" numeric not null,
      "asset" varchar(42) not null,
      "network" text not null,
      "pay_to" varchar(42) not null,
      "authorization_nonce" varchar(66) not null,
      "request_fingerprint" varchar(64) not null,
      "authorization_valid_before" timestamp with time zone not null,
      constraint "receipts_authorization_check" check (
        "authorization_nonce" ~ '^0x[0-9a-fA-F]{64}$'
        and "request_fingerprint" ~ '^[0-9a-f]{64}$'
      ),
      constraint "receipts_state_check" check (
        ("status" = 'pending' and "reason" is null
          and "intended_network" is null and "tx_hash" is null
          and "settlement_response" is null and "settled_at" is null)
        or ("status" = 'failed' and "reason" ~ '[^[:space:]]'
          and "intended_network" is null and "tx_hash" is null
          and "settlement_response" is null and "settled_at" is null)
        or ("status" = 'blocked' and "reason" ~ '[^[:space:]]'
          and "intended_network" is not null and "tx_hash" is null
          and "settlement_response" is null and "settled_at" is null)
      )
    );
    create unique index "receipts_agent_nonce_unique"
      on "${schema}"."receipts" ("agent_id", "authorization_nonce");
    create unique index "receipts_agent_fingerprint_unique"
      on "${schema}"."receipts" ("agent_id", "request_fingerprint");
  `);
}

async function applyPhase6Upgrade(schema: string) {
  const source = await readFile(
    new URL("../../drizzle/0016_cold_riptide.sql", import.meta.url),
    "utf8",
  );
  const statements = source
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

  await sql.begin(async (transaction) => {
    await transaction.unsafe(`set local search_path to "${schema}", public`);
    for (const statement of statements) {
      await transaction.unsafe(statement);
    }
  });
}

describe("Phase 6 receipt migration upgrade", () => {
  afterEach(async () => {
    for (const schema of schemas) {
      await sql.unsafe(`drop schema if exists "${schema}" cascade`);
      schemas.delete(schema);
    }
  });

  afterAll(async () => {
    await sql.end();
  });

  it("canonicalizes 0015-compatible mixed-case nonces before tightening the check", async () => {
    const schema = newSchemaName();
    const id = randomUUID();
    const agentId = randomUUID();
    const mixedCaseNonce = `0x${"aA".repeat(32)}`;
    const canonicalNonce = mixedCaseNonce.toLowerCase();
    await createLegacyReceiptsSchema(schema);

    await sql.unsafe(`
      insert into "${schema}"."receipts"
        (id, agent_id, amount_atomic, asset, network, pay_to,
          authorization_nonce, request_fingerprint, authorization_valid_before)
      values ('${id}', '${agentId}', '${AMOUNT_ATOMIC}', '${ASSET}', '${NETWORK}', '${PAY_TO}',
        '${mixedCaseNonce}', '${fingerprint(mixedCaseNonce)}', to_timestamp(${VALID_BEFORE}))
    `);

    await applyPhase6Upgrade(schema);

    const rows = await sql.unsafe<{ authorization_nonce: string; request_fingerprint: string }[]>(`
      select authorization_nonce, request_fingerprint
      from "${schema}"."receipts" where id = '${id}'
    `);
    expect(rows).toEqual([
      {
        authorization_nonce: canonicalNonce,
        request_fingerprint: fingerprint(mixedCaseNonce),
      },
    ]);

    await expect(
      sql.unsafe(`
        update "${schema}"."receipts"
        set authorization_nonce = '${mixedCaseNonce}' where id = '${id}'
      `),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("aborts descriptively without changing evidence when canonical nonces collide", async () => {
    const schema = newSchemaName();
    const agentId = randomUUID();
    const mixedCaseNonce = `0x${"aB".repeat(32)}`;
    const canonicalNonce = mixedCaseNonce.toLowerCase();
    await createLegacyReceiptsSchema(schema);

    await sql.unsafe(`
      insert into "${schema}"."agents" (id, agent_address)
      values ('${agentId}', '${AGENT_ADDRESS}');
      insert into "${schema}"."receipts"
        (id, agent_id, amount_atomic, asset, network, pay_to,
          authorization_nonce, request_fingerprint, authorization_valid_before)
      values
        ('${randomUUID()}', '${agentId}', '${AMOUNT_ATOMIC}', '${ASSET}', '${NETWORK}', '${PAY_TO}',
          '${mixedCaseNonce}', '${fingerprint(mixedCaseNonce)}', to_timestamp(${VALID_BEFORE})),
        ('${randomUUID()}', '${agentId}', '${AMOUNT_ATOMIC}', '${ASSET}', '${NETWORK}', '${PAY_TO}',
          '${canonicalNonce}', '${fingerprint(canonicalNonce)}', to_timestamp(${VALID_BEFORE}))
    `);

    await expect(applyPhase6Upgrade(schema)).rejects.toMatchObject({
      code: "23505",
      message: expect.stringContaining("case-insensitive authorization nonce collisions"),
    });

    const rows = await sql.unsafe<{ authorization_nonce: string }[]>(`
      select authorization_nonce from "${schema}"."receipts" order by authorization_nonce
    `);
    expect(rows.map((row) => row.authorization_nonce).sort()).toEqual(
      [mixedCaseNonce, canonicalNonce].sort(),
    );
  });

  it("marks legacy failed and blocked rows whose reason was missing", async () => {
    const schema = newSchemaName();
    const agentId = randomUUID();
    await createLegacyReceiptsSchema(schema);

    await sql.unsafe(`
      insert into "${schema}"."receipts"
        (id, agent_id, status, intended_network, amount_atomic, asset, network, pay_to,
          authorization_nonce, request_fingerprint, authorization_valid_before)
      values
        ('${randomUUID()}', '${agentId}', 'failed', null, '${AMOUNT_ATOMIC}', '${ASSET}',
          '${NETWORK}', '${PAY_TO}', '0x${"1".repeat(64)}', '${"2".repeat(64)}',
          to_timestamp(${VALID_BEFORE})),
        ('${randomUUID()}', '${agentId}', 'blocked', '${NETWORK}', '${AMOUNT_ATOMIC}', '${ASSET}',
          '${NETWORK}', '${PAY_TO}', '0x${"3".repeat(64)}', '${"4".repeat(64)}',
          to_timestamp(${VALID_BEFORE}))
    `);

    await applyPhase6Upgrade(schema);

    const rows = await sql.unsafe<{ reason: string; status: string }[]>(`
      select status, reason from "${schema}"."receipts" order by status
    `);
    expect(rows).toEqual([
      { reason: "LEGACY_REASON_MISSING", status: "blocked" },
      { reason: "LEGACY_REASON_MISSING", status: "failed" },
    ]);
    await expect(
      sql.unsafe(`
        update "${schema}"."receipts" set reason = null where status in ('failed', 'blocked')
      `),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
