import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import postgres from "postgres";
import { afterAll, afterEach, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for receipt migration tests");

const sql = postgres(databaseUrl, { max: 1 });
const schemas = new Set<string>();

function schemaName() {
  return `receipt_precision_${randomUUID().replaceAll("-", "")}`;
}

async function applyPrecisionUpgrade(schema: string) {
  const source = await readFile(
    new URL("../../drizzle/0020_loose_captain_cross.sql", import.meta.url),
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

describe("0020 receipt cursor precision upgrade", () => {
  afterEach(async () => {
    for (const schema of schemas) {
      await sql.unsafe(`drop schema if exists "${schema}" cascade`);
      schemas.delete(schema);
    }
  });

  afterAll(async () => {
    await sql.end();
  });

  it("normalizes timestamps and installs the exact keyset pagination index", async () => {
    const schema = schemaName();
    schemas.add(schema);
    await sql.unsafe(`
      create schema "${schema}";
      create table "${schema}"."receipts" (
        "id" uuid primary key,
        "agent_id" uuid not null,
        "created_at" timestamp with time zone default now() not null
      );
      create index "receipts_agent_created_idx"
        on "${schema}"."receipts" ("agent_id", "created_at" desc);
      insert into "${schema}"."receipts" (id, agent_id, created_at) values
        ('${randomUUID()}', '${randomUUID()}', '2026-07-17T12:00:00.000900Z'),
        ('${randomUUID()}', '${randomUUID()}', '2026-07-17T12:00:00.000400Z');
    `);

    await applyPrecisionUpgrade(schema);
    await sql.unsafe(`
      insert into "${schema}"."receipts" (id, agent_id, created_at)
      values ('${randomUUID()}', '${randomUUID()}', '2026-07-17T12:00:00.000800Z')
    `);

    const [column] = await sql<{ datetime_precision: number }[]>`
      select datetime_precision
      from information_schema.columns
      where table_schema = ${schema}
        and table_name = 'receipts'
        and column_name = 'created_at'
    `;
    expect(column?.datetime_precision).toBe(3);

    const rows = await sql.unsafe<{ created_at: string }[]>(`
      select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') as created_at
      from "${schema}"."receipts"
      order by created_at
    `);
    expect(rows.map((row) => row.created_at)).toEqual([
      "2026-07-17 12:00:00.000000",
      "2026-07-17 12:00:00.001000",
      "2026-07-17 12:00:00.001000",
    ]);

    const [index] = await sql<{ indexdef: string }[]>`
      select indexdef from pg_indexes
      where schemaname = ${schema} and indexname = 'receipts_agent_created_idx'
    `;
    expect(index?.indexdef).toContain("(agent_id, created_at DESC NULLS LAST, id DESC NULLS LAST)");
  });
});
