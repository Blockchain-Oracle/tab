import postgres from "postgres";

import { migrateDatabase } from "./lib/db/migrate";

export async function setup() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for PostgreSQL integration tests");
  }

  const client = postgres(databaseUrl, { max: 1 });
  let databaseName: string | undefined;

  try {
    const rows = await client<{ current_database: string }[]>`select current_database()`;
    databaseName = rows[0]?.current_database;
  } finally {
    await client.end();
  }

  if (databaseName !== "tab_test") {
    throw new Error(`Refusing to migrate non-test database: ${databaseName ?? "unknown"}`);
  }

  await migrateDatabase(databaseUrl);
}
