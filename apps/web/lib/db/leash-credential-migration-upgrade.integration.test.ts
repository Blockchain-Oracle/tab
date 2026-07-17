import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import postgres from "postgres";
import { afterAll, afterEach, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for credential migration tests");

const sql = postgres(databaseUrl, { max: 1 });
const schemas = new Set<string>();

function schemaName() {
  return `credential_upgrade_${randomUUID().replaceAll("-", "")}`;
}

async function applyCredentialUpgrade(schema: string) {
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

async function createLegacyAgents(schema: string) {
  schemas.add(schema);
  await sql.unsafe(`
    create schema "${schema}";
    create table "${schema}"."agents" (
      "id" uuid primary key,
      "name" text not null,
      "status" text not null,
      "signer_subject" text not null,
      "agent_address" varchar(42),
      "client_name" text,
      "created_at" timestamp with time zone default now() not null,
      constraint "agents_signer_subject_check" check (signer_subject ~ '[^[:space:]]')
    );
    create unique index "agents_signer_subject_unique"
      on "${schema}"."agents" ("signer_subject");
    create table "${schema}"."leash_keys" (
      "id" uuid primary key,
      "agent_id" uuid not null references "${schema}"."agents" ("id"),
      "created_at" timestamp with time zone default now() not null,
      "revoked_at" timestamp with time zone,
      "rotated_from_id" uuid references "${schema}"."leash_keys" ("id")
    );
  `);
}

describe("0021 credential lifecycle upgrade", () => {
  afterEach(async () => {
    for (const schema of schemas) {
      await sql.unsafe(`drop schema if exists "${schema}" cascade`);
      schemas.delete(schema);
    }
  });

  afterAll(async () => {
    await sql.end();
  });

  it("backfills legacy terminal agents without changing resumable credentials", async () => {
    const schema = schemaName();
    await createLegacyAgents(schema);
    const address = "0x1111111111111111111111111111111111111111";
    const ids = Object.fromEntries(
      ["provisioned", "paused", "frozen", "cancelled", "nuked"].map((status) => [
        status,
        randomUUID(),
      ]),
    );
    for (const [status, id] of Object.entries(ids)) {
      const historicalId = randomUUID();
      await sql.unsafe(`
        insert into "${schema}"."agents"
          (id, name, status, signer_subject, agent_address, created_at)
        values ('${id}', '${status} agent', '${status}', 'leash:${id}', '${address}',
          '2026-07-17T12:00:00.000900Z');
        insert into "${schema}"."leash_keys" (id, agent_id, created_at, revoked_at)
        values ('${historicalId}', '${id}', '2026-07-17T12:00:01Z', '2026-07-17T12:00:02Z');
        insert into "${schema}"."leash_keys" (id, agent_id, created_at, rotated_from_id)
        values ('${randomUUID()}', '${id}', '2026-07-17T12:00:03Z', '${historicalId}')
      `);
    }

    await applyCredentialUpgrade(schema);
    const rows = await sql.unsafe<
      {
        agent_address: string;
        credential_destroyed_at: Date | null;
        signer_subject: string | null;
        signer_subject_revoked_at: Date | null;
        status: string;
      }[]
    >(`
      select status, signer_subject, signer_subject_revoked_at,
        credential_destroyed_at, agent_address
      from "${schema}"."agents" order by status
    `);
    for (const status of ["provisioned", "paused", "frozen"]) {
      expect(rows.find((row) => row.status === status)).toMatchObject({
        credential_destroyed_at: null,
        signer_subject: `leash:${ids[status]}`,
        signer_subject_revoked_at: null,
      });
    }
    const cancelled = rows.find((row) => row.status === "cancelled");
    expect(cancelled).toMatchObject({ credential_destroyed_at: null, signer_subject: null });
    expect(cancelled?.signer_subject_revoked_at).toBeInstanceOf(Date);
    const nuked = rows.find((row) => row.status === "nuked");
    expect(nuked).toMatchObject({ agent_address: address, signer_subject: null });
    expect(nuked?.credential_destroyed_at).toEqual(nuked?.signer_subject_revoked_at);

    const keys = await sql.unsafe<{ revoked_at: Date | null; status: string }[]>(`
      select agent.status, leash_key.revoked_at
      from "${schema}"."leash_keys" as leash_key
      join "${schema}"."agents" as agent on agent.id = leash_key.agent_id
      order by agent.status, leash_key.created_at
    `);
    expect(keys.filter((key) => key.status === "nuked")).toEqual([]);
    expect(keys.filter((key) => key.status === "cancelled")).toEqual([
      expect.objectContaining({ revoked_at: expect.any(Date) }),
      expect.objectContaining({ revoked_at: expect.any(Date) }),
    ]);
    for (const status of ["provisioned", "paused", "frozen"]) {
      expect(keys.filter((key) => key.status === status).map((key) => key.revoked_at)).toEqual([
        expect.any(Date),
        null,
      ]);
    }
  });

  it("enforces valid lifecycle shapes while permitting a complete cancel re-provision", async () => {
    const schema = schemaName();
    await createLegacyAgents(schema);
    const id = randomUUID();
    await sql.unsafe(`
      insert into "${schema}"."agents" (id, name, status, signer_subject)
      values ('${id}', 'cancelled agent', 'cancelled', 'leash:${id}')
    `);
    await applyCredentialUpgrade(schema);

    await expect(
      sql.unsafe(`update "${schema}"."agents" set signer_subject = '   ' where id = '${id}'`),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      sql.unsafe(`
        update "${schema}"."agents"
        set status = 'provisioned', signer_subject = null,
          signer_subject_revoked_at = null, credential_destroyed_at = null
        where id = '${id}'
      `),
    ).rejects.toMatchObject({ code: "23514" });
    await sql.unsafe(`
      update "${schema}"."agents"
      set status = 'provisioned', signer_subject = 'leash:${randomUUID()}',
        signer_subject_revoked_at = null, credential_destroyed_at = null
      where id = '${id}'
    `);
  });

  it("makes nuclear lifecycle fields immutable but allows harmless metadata updates", async () => {
    const schema = schemaName();
    await createLegacyAgents(schema);
    const id = randomUUID();
    await sql.unsafe(`
      insert into "${schema}"."agents" (id, name, status, signer_subject)
      values ('${id}', 'nuclear agent', 'nuked', 'leash:${id}')
    `);
    await applyCredentialUpgrade(schema);

    await expect(
      sql.unsafe(`
        update "${schema}"."agents"
        set status = 'provisioned', signer_subject = 'leash:${randomUUID()}',
          signer_subject_revoked_at = null, credential_destroyed_at = null
        where id = '${id}'
      `),
    ).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("immutable") });
    await expect(
      sql.unsafe(`
        update "${schema}"."agents"
        set agent_address = '0x2222222222222222222222222222222222222222' where id = '${id}'
      `),
    ).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("immutable") });
    await sql.unsafe(`update "${schema}"."agents" set status = status where id = '${id}'`);
    await sql.unsafe(`
      update "${schema}"."agents" set name = 'renamed tombstone', client_name = 'monitor'
      where id = '${id}'
    `);
  });
});
