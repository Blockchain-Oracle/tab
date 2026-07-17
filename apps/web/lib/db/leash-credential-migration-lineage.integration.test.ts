import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import postgres from "postgres";
import { afterAll, afterEach, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for credential migration tests");
const sql = postgres(databaseUrl, { max: 1 });
const schemas = new Set<string>();

async function applyUpgrade(schema: string) {
  const source = await readFile(
    new URL("../../drizzle/0021_talented_ted_forrester.sql", import.meta.url),
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

describe("0021 legacy key-lineage preflight", () => {
  afterEach(async () => {
    for (const schema of schemas) {
      await sql.unsafe(`drop schema if exists "${schema}" cascade`);
      schemas.delete(schema);
    }
  });

  afterAll(async () => {
    await sql.end();
  });

  it("aborts atomically when a surviving agent references a nuclear key", async () => {
    const schema = `credential_lineage_${randomUUID().replaceAll("-", "")}`;
    schemas.add(schema);
    const nuclearAgent = randomUUID();
    const survivorAgent = randomUUID();
    const nuclearKey = randomUUID();
    await sql.unsafe(`
      create schema "${schema}";
      create table "${schema}"."agents" (
        id uuid primary key, name text not null, status text not null,
        signer_subject text not null, agent_address varchar(42), client_name text,
        created_at timestamp with time zone default now() not null,
        constraint agents_signer_subject_check check (signer_subject ~ '[^[:space:]]')
      );
      create table "${schema}"."leash_keys" (
        id uuid primary key, agent_id uuid not null references "${schema}"."agents" (id),
        created_at timestamp with time zone default now() not null,
        revoked_at timestamp with time zone,
        rotated_from_id uuid references "${schema}"."leash_keys" (id)
      );
      insert into "${schema}"."agents" (id, name, status, signer_subject) values
        ('${nuclearAgent}', 'nuclear', 'nuked', 'leash:${nuclearAgent}'),
        ('${survivorAgent}', 'survivor', 'provisioned', 'leash:${survivorAgent}');
      insert into "${schema}"."leash_keys" (id, agent_id)
      values ('${nuclearKey}', '${nuclearAgent}');
      insert into "${schema}"."leash_keys" (id, agent_id, rotated_from_id)
      values ('${randomUUID()}', '${survivorAgent}', '${nuclearKey}');
    `);

    await expect(applyUpgrade(schema)).rejects.toMatchObject({
      code: "23503",
      message: expect.stringContaining("surviving agent"),
    });
    const [column] = await sql<{ count: number }[]>`
      select count(*)::int as count from information_schema.columns
      where table_schema = ${schema} and column_name = 'signer_subject_revoked_at'
    `;
    expect(column?.count).toBe(0);
    const [keys] = await sql.unsafe<{ count: number }[]>(`
      select count(*)::int as count from "${schema}"."leash_keys"
    `);
    expect(keys?.count).toBe(2);
  });
});
