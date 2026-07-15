import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for dashboard transaction tests");

const connection = createDatabase(databaseUrl, 1);
const indexName = "webhook_deliveries_dashboard_head_idx";

afterAll(async () => {
  await connection.client.end();
});

describe("dashboard transaction query plan with real PostgreSQL", () => {
  it("indexes the current automatic webhook delivery head by settlement", async () => {
    const [index] = await connection.client<{ indexdef: string }[]>`
      select indexdef
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'webhook_deliveries'
        and indexname = ${indexName}
    `;

    expect(index?.indexdef).toContain("(settlement_id)");
    expect(index?.indexdef).toContain("superseded_by_id IS NULL");
    expect(index?.indexdef).toContain("type = 'payment'");
    expect(index?.indexdef).toContain("trigger = 'auto'");

    await connection.client`set enable_seqscan = off`;
    try {
      const plan = await connection.client`
        explain (format json, costs false)
        select id
        from webhook_deliveries
        where settlement_id = ${randomUUID()}
          and type = 'payment'
          and trigger = 'auto'
          and superseded_by_id is null
      `;
      expect(JSON.stringify(plan)).toContain(indexName);
    } finally {
      await connection.client`reset enable_seqscan`;
    }
  });
});
