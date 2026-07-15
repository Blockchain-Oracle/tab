import { randomUUID } from "node:crypto";

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

  it("rejects the zero settlement address at the database boundary", async () => {
    const [user] = await sql<{ id: string }[]>`
      insert into users (email, magic_issuer)
      values (${`constraint-${randomUUID()}@example.test`}, ${`did:ethr:${randomUUID()}`})
      returning id
    `;
    if (!user) throw new Error("Expected the database to return the inserted user");

    await expect(
      sql`
        insert into merchants (user_id, receiving_address)
        values (${user.id}, '0x0000000000000000000000000000000000000000')
      `,
    ).rejects.toMatchObject({ code: "23514" });

    await sql`delete from users where id = ${user.id}`;
  });
});
