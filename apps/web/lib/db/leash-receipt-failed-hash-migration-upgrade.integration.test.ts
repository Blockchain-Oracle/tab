import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import postgres from "postgres";
import { afterAll, afterEach, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for receipt migration tests");

const sql = postgres(databaseUrl, { max: 1 });
const schemas = new Set<string>();

function schemaName() {
  return `receipt_failed_hash_${randomUUID().replaceAll("-", "")}`;
}

async function applyFailedHashUpgrade(schema: string) {
  const source = await readFile(
    new URL("../../drizzle/0023_failed_transaction_evidence.sql", import.meta.url),
    "utf8",
  );
  const statements = source
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  await sql.begin(async (transaction) => {
    await transaction.unsafe(`set local search_path to "${schema}", public`);
    for (const statement of statements) await transaction.unsafe(statement);
  });
}

describe("0023 failed transaction evidence upgrade", () => {
  afterEach(async () => {
    for (const schema of schemas) {
      await sql.unsafe(`drop schema if exists "${schema}" cascade`);
      schemas.delete(schema);
    }
  });

  afterAll(async () => {
    await sql.end();
  });

  it("preserves legacy failures and only accepts paired failed hash evidence", async () => {
    const schema = schemaName();
    const hash = `0x${"ab".repeat(32)}`;
    schemas.add(schema);
    await sql.unsafe(`
      create schema "${schema}";
      create table "${schema}"."receipts" (
        "id" uuid primary key,
        "status" text not null,
        "reason" text,
        "intended_network" text,
        "tx_hash" varchar(66),
        "settlement_response" jsonb,
        "settled_at" timestamp with time zone,
        constraint "receipts_state_check" check (
          ("status" = 'pending' and "reason" is null and "intended_network" is null
            and "tx_hash" is null and "settlement_response" is null and "settled_at" is null)
          or ("status" = 'settled' and "reason" is null and "intended_network" is null
            and "tx_hash" is not null and "settlement_response" is not null
            and "settled_at" is not null)
          or ("status" = 'failed' and "reason" ~ '[^[:space:]]'
            and "intended_network" is null and "tx_hash" is null
            and "settlement_response" is null and "settled_at" is null)
          or ("status" = 'blocked' and "reason" ~ '[^[:space:]]'
            and "intended_network" is not null and "tx_hash" is null
            and "settlement_response" is null and "settled_at" is null)
        )
      );
      insert into "${schema}"."receipts" (id, status, reason)
      values ('${randomUUID()}', 'failed', 'FLOAT_EMPTY');
      insert into "${schema}"."receipts"
        (id, status, tx_hash, settlement_response, settled_at)
      values ('${randomUUID()}', 'settled', '${hash}', '{"verified":true}'::jsonb, now());
    `);

    await applyFailedHashUpgrade(schema);

    const [legacy] = await sql.unsafe<{ reason: string; tx_hash: string | null }[]>(`
      select reason, tx_hash from "${schema}"."receipts" where status = 'failed'
    `);
    expect(legacy).toEqual({ reason: "FLOAT_EMPTY", tx_hash: null });
    const [normalized] = await sql.unsafe<{ settlement_response: Record<string, unknown> }[]>(`
      select settlement_response from "${schema}"."receipts" where status = 'settled'
    `);
    expect(normalized?.settlement_response).toEqual({
      success: true,
      transaction: hash,
      verified: true,
    });

    await expect(
      sql.unsafe(`
        insert into "${schema}"."receipts"
          (id, status, reason, tx_hash, settlement_response)
        values (
          '${randomUUID()}', 'failed', 'invalid_exact_evm_transaction_failed', '${hash}',
          '{"success":false,"transaction":"${hash}"}'::jsonb
        )
      `),
    ).resolves.toBeDefined();

    for (const values of [
      `'${randomUUID()}', 'failed', 'invalid_exact_evm_transaction_failed', '${hash}', null`,
      `'${randomUUID()}', 'failed', 'invalid_exact_evm_transaction_failed', null, '{"success":false}'::jsonb`,
      `'${randomUUID()}', 'failed', 'invalid_exact_evm_transaction_failed', '${hash}', '{}'::jsonb`,
      `'${randomUUID()}', 'failed', 'invalid_exact_evm_transaction_failed', '${hash}', '{"success":false}'::jsonb`,
      `'${randomUUID()}', 'failed', 'invalid_exact_evm_transaction_failed', '${hash}', '{"success":"false","transaction":"${hash}"}'::jsonb`,
      `'${randomUUID()}', 'failed', 'invalid_exact_evm_transaction_failed', '${hash}', '{"transaction":"${hash}"}'::jsonb`,
      `'${randomUUID()}', 'failed', 'invalid_exact_evm_transaction_failed', '${hash}', '{"success":false,"transaction":"0x${"cd".repeat(32)}"}'::jsonb`,
      `'${randomUUID()}', 'failed', 'invalid_exact_evm_transaction_failed', '${hash}', '{"success":true}'::jsonb`,
    ]) {
      await expect(
        sql.unsafe(`
          insert into "${schema}"."receipts"
            (id, status, reason, tx_hash, settlement_response)
          values (${values})
        `),
      ).rejects.toMatchObject({ code: "23514" });
    }

    await expect(
      sql.unsafe(`
        insert into "${schema}"."receipts"
          (id, status, tx_hash, settlement_response, settled_at)
        values (
          '${randomUUID()}', 'settled', '${hash}',
          '{"success":true,"transaction":"${hash}"}'::jsonb, now()
        )
      `),
    ).resolves.toBeDefined();

    for (const response of [
      `{}`,
      `{"success":true}`,
      `{"transaction":"${hash}"}`,
      `{"success":false,"transaction":"${hash}"}`,
      `{"success":"true","transaction":"${hash}"}`,
      `{"success":true,"transaction":"0x${"cd".repeat(32)}"}`,
    ]) {
      await expect(
        sql.unsafe(`
          insert into "${schema}"."receipts"
            (id, status, tx_hash, settlement_response, settled_at)
          values ('${randomUUID()}', 'settled', '${hash}', '${response}'::jsonb, now())
        `),
      ).rejects.toMatchObject({ code: "23514" });
    }
  });
});
