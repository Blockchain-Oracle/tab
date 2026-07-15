import { createDatabase } from "./client";

type Connection = ReturnType<typeof createDatabase>;

const globalDatabase = globalThis as typeof globalThis & {
  tabDatabase?: Connection;
};

export function getServerDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  globalDatabase.tabDatabase ??= createDatabase(databaseUrl);
  return globalDatabase.tabDatabase;
}

export async function closeServerDatabase() {
  if (!globalDatabase.tabDatabase) {
    return;
  }

  await globalDatabase.tabDatabase.client.end();
  delete globalDatabase.tabDatabase;
}
