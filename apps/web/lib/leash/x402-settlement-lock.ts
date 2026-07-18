import { sql } from "drizzle-orm";

import type { Database } from "../db/client";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function lockX402Authorization(
  transaction: Transaction,
  identity: { network: string; nonce: string; payer: string },
) {
  const key = `${identity.network}:${identity.payer.toLowerCase()}:${identity.nonce.toLowerCase()}`;
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}
