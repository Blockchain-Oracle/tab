import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import postgres from "postgres";
import { afterAll, afterEach, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for notification migration tests");

const sql = postgres(databaseUrl, { max: 1 });
const schemas = new Set<string>();

function schemaName() {
  return `notification_upgrade_${randomUUID().replaceAll("-", "")}`;
}

function resourceKey(taggedIdentity: string) {
  return createHash("sha256").update(taggedIdentity).digest("hex");
}

async function createPhase7NotificationSchema(schema: string) {
  await sql.unsafe(`
    create schema "${schema}";
    create type "${schema}"."notification_type" as enum (
      'cap_75', 'cap_blocked', 'unusual_domain', 'cap_lowered_halt', 'float_low', 'float_empty'
    );
    create table "${schema}"."receipts" (
      "id" uuid primary key,
      "resource_url" text
    );
    create table "${schema}"."notifications" (
      "id" uuid primary key,
      "agent_id" uuid not null,
      "receipt_id" uuid,
      "type" "${schema}"."notification_type" not null,
      "event_key" text not null,
      "resource_host" text,
      constraint "notifications_resource_host_check" check (
        ("type" = 'unusual_domain' and "resource_host" is not null
          and char_length("resource_host") between 1 and 253
          and "resource_host" = lower("resource_host")
          and "resource_host" = btrim("resource_host")
          and "resource_host" !~ '[/?#@[:space:]]')
        or ("type" <> 'unusual_domain' and "resource_host" is null)
      )
    );
    create unique index "notifications_unusual_domain_unique"
      on "${schema}"."notifications" ("agent_id", "resource_host")
      where "type" = 'unusual_domain';
  `);
  schemas.add(schema);
}

async function applyIdentityUpgrade(schema: string) {
  const source = await readFile(
    new URL("../../drizzle/0018_lucky_tusk.sql", import.meta.url),
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

describe("0018 notification resource identity upgrade", () => {
  afterEach(async () => {
    for (const schema of schemas) {
      await sql.unsafe(`drop schema if exists "${schema}" cascade`);
      schemas.delete(schema);
    }
  });

  afterAll(async () => {
    await sql.end();
  });

  it("backfills tagged SHA-256 keys without collapsing MCP tools onto their host", async () => {
    const schema = schemaName();
    await createPhase7NotificationSchema(schema);
    const agentId = randomUUID();
    const mcpReceiptId = randomUUID();
    const httpReceiptId = randomUUID();
    await sql.unsafe(`
      insert into "${schema}"."receipts" (id, resource_url) values
        ('${mcpReceiptId}', 'mcp://tool/search'),
        ('${httpReceiptId}', 'https://api.vendor.test/pay');
      insert into "${schema}"."notifications"
        (id, agent_id, receipt_id, type, event_key, resource_host) values
        ('${randomUUID()}', '${agentId}', '${mcpReceiptId}', 'unusual_domain', 'mcp', 'tool'),
        ('${randomUUID()}', '${agentId}', '${httpReceiptId}', 'unusual_domain', 'http',
          'api.vendor.test'),
        ('${randomUUID()}', '${agentId}', null, 'unusual_domain', 'legacy',
          'legacy.vendor.test'),
        ('${randomUUID()}', '${agentId}', null, 'cap_75', 'cap', null);
    `);

    await applyIdentityUpgrade(schema);

    const rows = await sql.unsafe<{ event_key: string; resource_key: string | null }[]>(`
      select event_key, resource_key from "${schema}"."notifications" order by event_key
    `);
    expect(rows).toEqual([
      { event_key: "cap", resource_key: null },
      {
        event_key: "http",
        resource_key: resourceKey("http-host:api.vendor.test"),
      },
      {
        event_key: "legacy",
        resource_key: resourceKey("http-host:legacy.vendor.test"),
      },
      {
        event_key: "mcp",
        resource_key: resourceKey("mcp-resource:mcp://tool/search"),
      },
    ]);

    const exportKey = resourceKey("mcp-resource:mcp://tool/export");
    await sql.unsafe(`
      insert into "${schema}"."notifications"
        (id, agent_id, type, event_key, resource_host, resource_key)
      values (
        '${randomUUID()}', '${agentId}', 'unusual_domain', 'mcp-export', 'tool', '${exportKey}'
      )
    `);
    await expect(
      sql.unsafe(`
        insert into "${schema}"."notifications"
          (id, agent_id, type, event_key, resource_host, resource_key)
        values (
          '${randomUUID()}', '${agentId}', 'unusual_domain', 'mcp-replay', 'other',
          '${resourceKey("mcp-resource:mcp://tool/search")}'
        )
      `),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      sql.unsafe(`
        insert into "${schema}"."notifications"
          (id, agent_id, type, event_key, resource_host, resource_key)
        values ('${randomUUID()}', '${randomUUID()}', 'unusual_domain', 'bad', 'tool', 'secret')
      `),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
