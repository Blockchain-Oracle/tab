import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { merchants, users } from "./identity-schema";

/**
 * Executed faucet grants: one row per real starter-grant attempt, storing
 * the full truthful report (tx hashes, blockers). The windowed throttle
 * lives in rate_limit_attempts; this table is the evidence ledger.
 * Attribution is exactly one of: an agent owner (dashboard claims) or a
 * merchant (checkout buyer grants under that merchant's test key).
 */
export const faucetGrants = pgTable(
  "faucet_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id").references(() => merchants.id, { onDelete: "cascade" }),
    recipient: text("recipient").notNull(),
    report: jsonb("report").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("faucet_grants_owner_created_idx").on(table.ownerId, table.createdAt.desc()),
    index("faucet_grants_merchant_created_idx").on(table.merchantId, table.createdAt.desc()),
    index("faucet_grants_recipient_created_idx").on(table.recipient, table.createdAt.desc()),
    check(
      "faucet_grants_attribution_check",
      sql`(${table.ownerId} is null) <> (${table.merchantId} is null)`,
    ),
  ],
);
