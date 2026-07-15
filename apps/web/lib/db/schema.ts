import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  customType,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

export const receivingAddressSource = pgEnum("receiving_address_source", [
  "magic_default",
  "custom",
]);
export const apiKeyType = pgEnum("api_key_type", ["secret", "publishable"]);
export const apiKeyPermissions = pgEnum("api_key_permissions", ["full", "read_only"]);
export const environment = pgEnum("environment", ["test", "live"]);
export const quickstartSource = pgEnum("quickstart_source", ["auto", "manual"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: citext("email").notNull(),
    magicIssuer: text("magic_issuer").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    uniqueIndex("users_magic_issuer_unique").on(table.magicIssuer),
  ],
);

export const merchants = pgTable(
  "merchants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    businessName: text("business_name"),
    logoEtag: text("logo_etag"),
    logoUrl: text("logo_url"),
    logoUploadCount: integer("logo_upload_count").default(0).notNull(),
    logoUploadWindowStartedAt: timestamp("logo_upload_window_started_at", {
      withTimezone: true,
    }),
    receivingAddress: varchar("receiving_address", { length: 42 }).notNull(),
    receivingAddressSource: receivingAddressSource("receiving_address_source")
      .default("magic_default")
      .notNull(),
    liveActivatedAt: timestamp("live_activated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("merchants_user_id_unique").on(table.userId),
    check(
      "merchants_receiving_address_check",
      sql`${table.receivingAddress} ~ '^0x[0-9a-fA-F]{40}$'
        and lower(${table.receivingAddress}) <> '0x0000000000000000000000000000000000000000'`,
    ),
  ],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: apiKeyType("type").notNull(),
    permissions: apiKeyPermissions("permissions"),
    env: environment("env").notNull(),
    prefix: text("prefix").notNull(),
    last4: varchar("last4", { length: 4 }).notNull(),
    publicKey: text("public_key"),
    secretHash: text("secret_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    rotatedFromId: uuid("rotated_from_id").references((): AnyPgColumn => apiKeys.id),
  },
  (table) => [
    uniqueIndex("api_keys_public_key_unique").on(table.publicKey),
    uniqueIndex("api_keys_secret_hash_unique").on(table.secretHash),
    uniqueIndex("api_keys_one_active_publishable_per_env")
      .on(table.merchantId, table.type, table.env)
      .where(sql`${table.revokedAt} is null and ${table.type} = 'publishable'`),
    check(
      "api_keys_material_check",
      sql`(${table.type} = 'publishable' and ${table.publicKey} is not null and ${table.secretHash} is null)
        or (${table.type} = 'secret' and ${table.publicKey} is null and ${table.secretHash} is not null
          and ${table.secretHash} ~ '^[0-9a-f]{64}$')`,
    ),
    check(
      "api_keys_permissions_check",
      sql`(${table.type} = 'publishable' and ${table.permissions} is null)
        or (${table.type} = 'secret' and ${table.permissions} is not null)`,
    ),
  ],
);

export const quickstartProgress = pgTable(
  "quickstart_progress",
  {
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    stepKey: text("step_key").notNull(),
    doneAt: timestamp("done_at", { withTimezone: true }).notNull(),
    source: quickstartSource("source").notNull(),
  },
  (table) => [primaryKey({ columns: [table.merchantId, table.stepKey] })],
);
