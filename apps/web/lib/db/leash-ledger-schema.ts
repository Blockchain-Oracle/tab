import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { agents, leashNetwork } from "./leash-control-schema";

export const leashAsset = pgEnum("leash_asset", ["USDC"]);
export const agentEventType = pgEnum("agent_event_type", ["connect", "sign", "block", "revoke"]);
export const agentEventSurface = pgEnum("agent_event_surface", [
  "agent",
  "web",
  "pwa",
  "push_action",
  "system",
]);

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
