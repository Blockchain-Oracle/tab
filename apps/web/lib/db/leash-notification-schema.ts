import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./identity-schema";
import { agents, capCycles } from "./leash-control-schema";
import { receipts } from "./leash-receipt-schema";

export const notificationTier = pgEnum("notification_tier", ["2", "3"]);
export const notificationType = pgEnum("notification_type", [
  "cap_75",
  "cap_blocked",
  "unusual_domain",
  "cap_lowered_halt",
  "float_low",
  "float_empty",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    cycleId: uuid("cycle_id").notNull(),
    receiptId: uuid("receipt_id"),
    tier: notificationTier("tier").notNull(),
    type: notificationType("type").notNull(),
    eventKey: text("event_key").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    resourceHost: text("resource_host"),
    resourceKey: text("resource_key"),
    sticky: boolean("sticky").default(false).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { precision: 3, withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.cycleId, table.agentId],
      foreignColumns: [capCycles.id, capCycles.agentId],
      name: "notifications_cycle_agent_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.receiptId, table.cycleId, table.agentId],
      foreignColumns: [receipts.id, receipts.cycleId, receipts.agentId],
      name: "notifications_receipt_cycle_agent_fk",
    }).onDelete("cascade"),
    uniqueIndex("notifications_agent_event_key_unique").on(table.agentId, table.eventKey),
    uniqueIndex("notifications_cap_75_cycle_unique")
      .on(table.agentId, table.cycleId)
      .where(sql`${table.type} = 'cap_75'`),
    uniqueIndex("notifications_unusual_resource_unique")
      .on(table.agentId, table.resourceKey)
      .where(sql`${table.type} = 'unusual_domain'`),
    uniqueIndex("notifications_one_active_cap_halt")
      .on(table.agentId)
      .where(
        sql`${table.resolvedAt} is null
          and ${table.type} in ('cap_blocked', 'cap_lowered_halt')`,
      ),
    index("notifications_agent_created_idx").on(table.agentId, table.createdAt.desc()),
    index("notifications_agent_unread_idx")
      .on(table.agentId, table.createdAt.desc())
      .where(sql`${table.readAt} is null`),
    index("notifications_receipt_idx")
      .on(table.receiptId)
      .where(sql`${table.receiptId} is not null`),
    check(
      "notifications_tier_type_check",
      sql`(${table.tier} = '2'
          and ${table.type} in ('cap_75', 'unusual_domain', 'float_low', 'float_empty'))
        or (${table.tier} = '3'
          and ${table.type} in ('cap_blocked', 'cap_lowered_halt'))`,
    ),
    check(
      "notifications_sticky_check",
      sql`(${table.tier} = '2' and not ${table.sticky} and ${table.resolvedAt} is null)
        or (${table.tier} = '3' and ${table.sticky})`,
    ),
    check(
      "notifications_resource_identity_check",
      sql`(${table.type} = 'unusual_domain' and ${table.resourceHost} is not null
          and char_length(${table.resourceHost}) between 1 and 253
          and ${table.resourceHost} = lower(${table.resourceHost})
          and ${table.resourceHost} = btrim(${table.resourceHost})
          and ${table.resourceHost} !~ '[/?#@[:space:]]'
          and ${table.resourceKey} is not null
          and ${table.resourceKey} ~ '^[0-9a-f]{64}$')
        or (${table.type} <> 'unusual_domain'
          and ${table.resourceHost} is null and ${table.resourceKey} is null)`,
    ),
    check(
      "notifications_event_key_check",
      sql`char_length(btrim(${table.eventKey})) between 1 and 300`,
    ),
    check("notifications_metadata_check", sql`jsonb_typeof(${table.metadata}) = 'object'`),
    check(
      "notifications_timestamps_check",
      sql`(${table.readAt} is null or ${table.readAt} >= ${table.createdAt})
        and (${table.resolvedAt} is null or ${table.resolvedAt} >= ${table.createdAt})`,
    ),
  ],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("push_subscriptions_endpoint_unique").on(table.endpoint),
    index("push_subscriptions_owner_active_idx")
      .on(table.ownerId, table.createdAt.desc())
      .where(sql`${table.revokedAt} is null`),
    check(
      "push_subscriptions_endpoint_check",
      sql`char_length(${table.endpoint}) between 1 and 2048
        and ${table.endpoint} ~ '^https://[^[:space:]]+$'`,
    ),
    check(
      "push_subscriptions_keys_check",
      sql`char_length(btrim(${table.p256dh})) between 1 and 512
        and char_length(btrim(${table.auth})) between 1 and 512`,
    ),
    check(
      "push_subscriptions_revoked_at_check",
      sql`${table.revokedAt} is null or ${table.revokedAt} >= ${table.createdAt}`,
    ),
  ],
);
