import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { agents, capCycles, leashNetwork } from "./leash-control-schema";

export const receiptStatus = pgEnum("receipt_status", ["pending", "settled", "failed", "blocked"]);

export type ReceiptOrigin = {
  clientName?: string;
  toolName?: string;
  transport: "http" | "mcp";
};

export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    cycleId: uuid("cycle_id").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => receipts.id),
    status: receiptStatus("status").default("pending").notNull(),
    reason: text("reason"),
    amountAtomic: numeric("amount_atomic").notNull(),
    amountUsd: numeric("amount_usd", { precision: 38, scale: 6 }).notNull(),
    asset: varchar("asset", { length: 42 }).notNull(),
    network: leashNetwork("network").notNull(),
    intendedNetwork: leashNetwork("intended_network"),
    payTo: varchar("pay_to", { length: 42 }).notNull(),
    authorizationNonce: varchar("authorization_nonce", { length: 66 }).notNull(),
    requestFingerprint: varchar("request_fingerprint", { length: 64 }).notNull(),
    authorizationValidBefore: timestamp("authorization_valid_before", {
      withTimezone: true,
    }).notNull(),
    origin: jsonb("origin").$type<ReceiptOrigin>(),
    settlementResponse: jsonb("settlement_response").$type<Record<string, unknown>>(),
    txHash: varchar("tx_hash", { length: 66 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.cycleId, table.agentId],
      foreignColumns: [capCycles.id, capCycles.agentId],
      name: "receipts_cycle_agent_fk",
    }),
    uniqueIndex("receipts_agent_nonce_unique").on(table.agentId, table.authorizationNonce),
    uniqueIndex("receipts_agent_fingerprint_unique").on(table.agentId, table.requestFingerprint),
    uniqueIndex("receipts_network_tx_hash_unique")
      .on(table.network, table.txHash)
      .where(sql`${table.txHash} is not null`),
    index("receipts_cap_gate_idx").on(table.agentId, table.cycleId, table.status),
    index("receipts_agent_created_idx").on(table.agentId, table.createdAt.desc()),
    check(
      "receipts_amount_atomic_check",
      sql`${table.amountAtomic} > 0 and ${table.amountAtomic} = trunc(${table.amountAtomic})`,
    ),
    check("receipts_amount_usd_check", sql`${table.amountUsd} > 0`),
    check(
      "receipts_pay_to_check",
      sql`${table.payTo} ~ '^0x[0-9a-fA-F]{40}$'
        and lower(${table.payTo}) <> '0x0000000000000000000000000000000000000000'`,
    ),
    check(
      "receipts_native_usdc_check",
      sql`(${table.network} = 'eip155:8453'
          and lower(${table.asset}) = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913')
        or (${table.network} = 'eip155:42161'
          and lower(${table.asset}) = '0xaf88d065e77c8cc2239327c5edb3a432268e5831')`,
    ),
    check(
      "receipts_authorization_check",
      sql`${table.authorizationNonce} ~ '^0x[0-9a-f]{64}$'
        and ${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "receipts_origin_check",
      sql`${table.origin} is null or (jsonb_typeof(${table.origin}) = 'object'
        and ${table.origin} ? 'transport'
        and ${table.origin}->>'transport' in ('mcp', 'http'))`,
    ),
    check(
      "receipts_tx_hash_check",
      sql`${table.txHash} is null or ${table.txHash} ~ '^0x[0-9a-fA-F]{64}$'`,
    ),
    check(
      "receipts_state_check",
      sql`(${table.status} = 'pending' and ${table.reason} is null
          and ${table.intendedNetwork} is null and ${table.txHash} is null
          and ${table.settlementResponse} is null and ${table.settledAt} is null)
        or (${table.status} = 'settled' and ${table.reason} is null
          and ${table.intendedNetwork} is null and ${table.txHash} is not null
          and ${table.settlementResponse} is not null and ${table.settledAt} is not null)
        or (${table.status} = 'failed' and ${table.reason} is not null
          and ${table.reason} ~ '[^[:space:]]' and ${table.intendedNetwork} is null
          and ${table.txHash} is null and ${table.settlementResponse} is null
          and ${table.settledAt} is null)
        or (${table.status} = 'blocked' and ${table.reason} is not null
          and ${table.reason} ~ '[^[:space:]]' and ${table.intendedNetwork} is not null
          and ${table.txHash} is null and ${table.settlementResponse} is null
          and ${table.settledAt} is null)`,
    ),
  ],
);
