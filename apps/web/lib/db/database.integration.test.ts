import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for PostgreSQL integration tests");
}

const sql = postgres(databaseUrl, { max: 1 });

describe("Phase 2 PostgreSQL migration", () => {
  afterAll(async () => {
    await sql.end();
  });

  it("runs destructive integration tests only against tab_test", async () => {
    const rows = await sql<{ current_database: string }[]>`select current_database()`;

    expect(rows).toEqual([{ current_database: "tab_test" }]);
  });

  it("creates the canonical Phase 2 tables in real PostgreSQL", async () => {
    const rows = await sql<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('users', 'merchants', 'api_keys', 'quickstart_progress')
      order by table_name
    `;

    expect(rows.map((row) => row.table_name)).toEqual([
      "api_keys",
      "merchants",
      "quickstart_progress",
      "users",
    ]);
  });

  it("enables citext for case-insensitive identity uniqueness", async () => {
    const rows = await sql<{ extname: string }[]>`
      select extname from pg_extension where extname = 'citext'
    `;

    expect(rows).toEqual([{ extname: "citext" }]);
  });
});
