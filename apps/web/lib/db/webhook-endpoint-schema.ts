import { sql } from "drizzle-orm";
import {
  check,
  integer,
  type PgTableExtraConfigValue,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { environment, merchants } from "./identity-schema";

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    env: environment("env").notNull(),
    url: text("url").notNull(),
    secretCiphertext: text("secret_ciphertext"),
    secretNonce: varchar("secret_nonce", { length: 16 }),
    secretAuthTag: varchar("secret_auth_tag", { length: 22 }),
    secretKeyVersion: integer("secret_key_version"),
    secretLast4: varchar("secret_last4", { length: 4 }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table): PgTableExtraConfigValue[] => [
    unique("webhook_endpoints_id_scope_unique").on(table.id, table.merchantId, table.env),
    uniqueIndex("webhook_endpoints_one_active_per_env")
      .on(table.merchantId, table.env)
      .where(sql`${table.deletedAt} is null`),
    check(
      "webhook_endpoints_url_check",
      sql`char_length(btrim(${table.url})) between 1 and 2048
        and (${table.url} ~ '^https://[^/?#[:space:]@]+([:/?#]|$)'
          or (${table.env} = 'test'
            and ${table.url} ~ '^http://(127\\.0\\.0\\.1|\\[::1\\]|localhost)(:[0-9]+)?/'))
        and ${table.url} !~* '^https://(localhost\\.?|127(\\.[0-9]{1,3}){3}|10(\\.[0-9]{1,3}){3}|192\\.168(\\.[0-9]{1,3}){2}|169\\.254(\\.[0-9]{1,3}){2}|172\\.(1[6-9]|2[0-9]|3[01])(\\.[0-9]{1,3}){2}|\\[(::1|f[cd][0-9a-f:]*|fe[89ab][0-9a-f:]*)\\])([:/?#]|$)'`,
    ),
    check("webhook_endpoints_last4_check", sql`char_length(${table.secretLast4}) = 4`),
    check(
      "webhook_endpoints_secret_envelope_check",
      sql`coalesce(((${table.deletedAt} is null
          and ${table.secretCiphertext} is not null
          and char_length(${table.secretCiphertext}) > 0
          and ${table.secretNonce} is not null
          and ${table.secretNonce} ~ '^[A-Za-z0-9_-]{16}$'
          and ${table.secretAuthTag} is not null
          and ${table.secretAuthTag} ~ '^[A-Za-z0-9_-]{22}$'
          and ${table.secretKeyVersion} is not null
          and ${table.secretKeyVersion} > 0)
        or (${table.deletedAt} is not null
          and ${table.secretCiphertext} is null and ${table.secretNonce} is null
          and ${table.secretAuthTag} is null and ${table.secretKeyVersion} is null)), false)`,
    ),
  ],
);
