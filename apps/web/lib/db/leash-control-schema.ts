import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  index,
  integer,
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
export const leashNetwork = pgEnum("leash_network", ["eip155:8453", "eip155:42161"]);

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
