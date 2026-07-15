import { resolve } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export async function migrateDatabase(
  databaseUrl: string,
  migrationsFolder = resolve(process.cwd(), "drizzle"),
) {
  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client);

  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await client.end();
  }
}
