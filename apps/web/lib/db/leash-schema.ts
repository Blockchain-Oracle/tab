import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./identity-schema";

export const agentStatus = pgEnum("agent_status", [
  "provisioned",
  "paused",
  "frozen",
  "cancelled",
  "nuked",
]);
export const capFrequency = pgEnum("cap_frequency", ["daily", "weekly", "monthly", "never"]);
export const capResetReason = pgEnum("cap_reset_reason", [
  "schedule",
  "manual",
  "frequency_change",
]);
export const receiptStatus = pgEnum("receipt_status", ["pending", "settled", "failed", "blocked"]);
export const leashNetwork = pgEnum("leash_network", ["eip155:8453", "eip155:42161"]);
export const leashAsset = pgEnum("leash_asset", ["USDC"]);
export const agentEventType = pgEnum("agent_event_type", ["connect", "sign", "block", "revoke"]);
export const agentEventSurface = pgEnum("agent_event_surface", [
  "agent",
  "web",
  "pwa",
  "push_action",
  "system",
]);

export type ReceiptOrigin = {
  clientName?: string;
  toolName?: string;
  transport: "http" | "mcp";
};

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: agentStatus("status").default("provisioned").notNull(),
    signerSubject: text("signer_subject").notNull(),
    agentAddress: varchar("agent_address", { length: 42 }),
    clientName: text("client_name"),
    clientVersion: text("client_version"),
    transport: text("transport"),
    connectionCount: integer("connection_count").default(0).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("agents_owner_id_idx").on(table.ownerId),
    uniqueIndex("agents_signer_subject_unique").on(table.signerSubject),
    uniqueIndex("agents_agent_address_unique")
      .on(table.agentAddress)
      .where(sql`${table.agentAddress} is not null`),
    check("agents_name_check", sql`${table.name} ~ '[^[:space:]]'`),
    check("agents_signer_subject_check", sql`${table.signerSubject} ~ '[^[:space:]]'`),
    check(
      "agents_address_check",
      sql`${table.agentAddress} is null or (${table.agentAddress} ~ '^0x[0-9a-fA-F]{40}$'
        and lower(${table.agentAddress}) <> '0x0000000000000000000000000000000000000000')`,
    ),
    check("agents_connection_count_check", sql`${table.connectionCount} >= 0`),
  ],
);

export const leashKeys = pgTable(
  "leash_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    hashedKey: varchar("hashed_key", { length: 64 }).notNull(),
    prefix: text("prefix").notNull(),
    last4: varchar("last4", { length: 4 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastAuthFailureAt: timestamp("last_auth_failure_at", { withTimezone: true }),
    lastAuthFailureCode: text("last_auth_failure_code"),
    rotatedFromId: uuid("rotated_from_id").references((): AnyPgColumn => leashKeys.id),
  },
  (table) => [
    uniqueIndex("leash_keys_hashed_key_unique").on(table.hashedKey),
    uniqueIndex("leash_keys_one_active_per_agent")
      .on(table.agentId)
      .where(sql`${table.revokedAt} is null`),
    check("leash_keys_hash_check", sql`${table.hashedKey} ~ '^[0-9a-f]{64}$'`),
    check("leash_keys_prefix_check", sql`${table.prefix} = 'leash_sk_'`),
    check("leash_keys_last4_check", sql`${table.last4} ~ '^[A-Za-z0-9_-]{4}$'`),
  ],
);

export const caps = pgTable(
  "caps",
  {
    agentId: uuid("agent_id")
      .primaryKey()
      .references(() => agents.id, { onDelete: "cascade" }),
    amountUsdCents: numeric("amount_usd_cents", { precision: 20, scale: 0 }),
    frequency: capFrequency("frequency").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("caps_amount_check", sql`${table.amountUsdCents} is null or ${table.amountUsdCents} > 0`),
  ],
);

export const capCycles = pgTable(
  "cap_cycles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    resetReason: capResetReason("reset_reason"),
  },
  (table) => [
    unique("cap_cycles_id_agent_unique").on(table.id, table.agentId),
    uniqueIndex("cap_cycles_one_active_per_agent")
      .on(table.agentId)
      .where(sql`${table.endedAt} is null`),
    index("cap_cycles_agent_started_idx").on(table.agentId, table.startedAt.desc()),
    check(
      "cap_cycles_end_check",
      sql`(${table.endedAt} is null and ${table.resetReason} is null)
        or (${table.endedAt} > ${table.startedAt} and ${table.resetReason} is not null)`,
    ),
  ],
);

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
      sql`${table.authorizationNonce} ~ '^0x[0-9a-fA-F]{64}$'
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
        or (${table.status} = 'failed' and ${table.reason} ~ '[^[:space:]]'
          and ${table.intendedNetwork} is null and ${table.txHash} is null
          and ${table.settlementResponse} is null and ${table.settledAt} is null)
        or (${table.status} = 'blocked' and ${table.reason} ~ '[^[:space:]]'
          and ${table.intendedNetwork} is not null and ${table.txHash} is null
          and ${table.settlementResponse} is null and ${table.settledAt} is null)`,
    ),
  ],
);

export const floats = pgTable(
  "floats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    network: leashNetwork("network").notNull(),
    asset: leashAsset("asset").notNull(),
    tokenAddress: varchar("token_address", { length: 42 }).notNull(),
    balanceAtomic: numeric("balance_atomic").notNull(),
    balanceUsd: numeric("balance_usd", { precision: 38, scale: 6 }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("floats_agent_network_unique").on(table.agentId, table.network),
    check(
      "floats_balance_atomic_check",
      sql`${table.balanceAtomic} >= 0 and ${table.balanceAtomic} = trunc(${table.balanceAtomic})`,
    ),
    check("floats_balance_usd_check", sql`${table.balanceUsd} >= 0`),
    check(
      "floats_native_usdc_check",
      sql`(${table.network} = 'eip155:8453'
          and lower(${table.tokenAddress}) = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913')
        or (${table.network} = 'eip155:42161'
          and lower(${table.tokenAddress}) = '0xaf88d065e77c8cc2239327c5edb3a432268e5831')`,
    ),
  ],
);

export const agentEvents = pgTable(
  "agent_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    type: agentEventType("type").notNull(),
    actorSurface: agentEventSurface("actor_surface").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("agent_events_agent_created_idx").on(table.agentId, table.createdAt.desc()),
    check("agent_events_metadata_check", sql`jsonb_typeof(${table.metadata}) = 'object'`),
  ],
);
