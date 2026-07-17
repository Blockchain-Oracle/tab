import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import postgres from "postgres";
import { afterAll, afterEach, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for receipt migration tests");

const sql = postgres(databaseUrl, { max: 1 });
const schemas = new Set<string>();

function schemaName() {
  return `receipt_cap_context_${randomUUID().replaceAll("-", "")}`;
}

async function applyCapContextUpgrade(schema: string) {
  const source = await readFile(
    new URL("../../drizzle/0022_receipt_cap_context.sql", import.meta.url),
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

describe("0022 immutable receipt cap-context upgrade", () => {
  afterEach(async () => {
    for (const schema of schemas) {
      await sql.unsafe(`drop schema if exists "${schema}" cascade`);
      schemas.delete(schema);
    }
  });

  afterAll(async () => {
    await sql.end();
  });

  it("keeps legacy evidence unavailable and enforces complete integer snapshots", async () => {
    const schema = schemaName();
    schemas.add(schema);
    await sql.unsafe(`
      create schema "${schema}";
      create table "${schema}"."receipts" (
        "id" uuid primary key,
        "amount_atomic" numeric not null
      );
      insert into "${schema}"."receipts" (id, amount_atomic)
      values ('${randomUUID()}', 420000);
    `);

    await applyCapContextUpgrade(schema);

    const legacy = await sql.unsafe<
      { cap_atomic_at_attempt: string | null; committed_atomic_before: string | null }[]
    >(`
      select cap_atomic_at_attempt, committed_atomic_before from "${schema}"."receipts"
    `);
    expect(legacy).toEqual([{ cap_atomic_at_attempt: null, committed_atomic_before: null }]);

    await expect(
      sql.unsafe(`
        insert into "${schema}"."receipts"
          (id, amount_atomic, cap_atomic_at_attempt, committed_atomic_before)
        values ('${randomUUID()}', 1, 1000000, 0)
      `),
    ).resolves.toBeDefined();

    for (const values of ["1000000, null", "null, 0", "0, 0", "1000000.5, 0", "1000000, -1"]) {
      await expect(
        sql.unsafe(`
          insert into "${schema}"."receipts"
            (id, amount_atomic, cap_atomic_at_attempt, committed_atomic_before)
          values ('${randomUUID()}', 1, ${values})
        `),
      ).rejects.toMatchObject({ code: "23514" });
    }
  });
});
