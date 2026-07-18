import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { leashNetwork } from "./leash-control-schema";
import { receipts } from "./leash-receipt-schema";

export const x402ResourceSettlements = pgTable(
  "x402_resource_settlements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    receiptId: uuid("receipt_id").references(() => receipts.id, { onDelete: "set null" }),
    paymentIdentifier: varchar("payment_identifier", { length: 256 }),
    paymentFingerprint: varchar("payment_fingerprint", { length: 64 }).notNull(),
    endpoint: text("endpoint").notNull(),
    facilitatorUrl: text("facilitator_url").notNull(),
    facilitatorResponse: jsonb("facilitator_response").$type<Record<string, unknown>>().notNull(),
    network: leashNetwork("network").notNull(),
    asset: varchar("asset", { length: 42 }).notNull(),
    amountAtomic: numeric("amount_atomic").notNull(),
    payer: varchar("payer", { length: 42 }).notNull(),
    payee: varchar("payee", { length: 42 }).notNull(),
    nonce: varchar("nonce", { length: 66 }).notNull(),
    authorizationValidAfter: timestamp("authorization_valid_after", {
      precision: 3,
      withTimezone: true,
    }).notNull(),
    authorizationValidBefore: timestamp("authorization_valid_before", {
      precision: 3,
      withTimezone: true,
    }).notNull(),
    txHash: varchar("tx_hash", { length: 66 }).notNull(),
    explorerUrl: text("explorer_url").notNull(),
    testFunds: boolean("test_funds").default(true).notNull(),
    settledAt: timestamp("settled_at", { precision: 3, withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { precision: 3, withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("x402_resource_settlements_network_tx_unique").on(table.network, table.txHash),
    uniqueIndex("x402_resource_settlements_network_payer_nonce_unique").on(
      table.network,
      sql`lower(${table.payer})`,
      table.nonce,
    ),
    uniqueIndex("x402_resource_settlements_receipt_unique")
      .on(table.receiptId)
      .where(sql`${table.receiptId} is not null`),
    uniqueIndex("x402_resource_settlements_payment_unique")
      .on(table.network, table.paymentIdentifier)
      .where(sql`${table.paymentIdentifier} is not null`),
    check(
      "x402_resource_settlements_profile_check",
      sql`${table.network} = 'eip155:84532'
        and lower(${table.asset}) = '0x036cbd53842c5426634e7929541ec2318f3dcf7e'
        and ${table.testFunds} is true`,
    ),
    check("x402_resource_settlements_amount_check", sql`${table.amountAtomic} = 1000`),
    check(
      "x402_resource_settlements_address_check",
      sql`${table.payer} ~ '^0x[0-9a-fA-F]{40}$'
        and lower(${table.payer}) <> '0x0000000000000000000000000000000000000000'
        and ${table.payee} ~ '^0x[0-9a-fA-F]{40}$'
        and lower(${table.payee}) <> '0x0000000000000000000000000000000000000000'`,
    ),
    check(
      "x402_resource_settlements_authorization_check",
      sql`${table.nonce} ~ '^0x[0-9a-f]{64}$'
        and ${table.authorizationValidAfter} < ${table.authorizationValidBefore}`,
    ),
    check(
      "x402_resource_settlements_target_check",
      sql`${table.endpoint} ~ '^https://[^/?#[:space:]]+/api/x402/testnet$'
        and ${table.facilitatorUrl} = 'https://x402.org/facilitator'`,
    ),
    check(
      "x402_resource_settlements_response_check",
      sql`(jsonb_typeof(${table.facilitatorResponse}) = 'object'
        and octet_length(${table.facilitatorResponse}::text) <= 32768
        and ${table.facilitatorResponse} @> '{"success":true}'::jsonb
        and lower(${table.facilitatorResponse}->>'transaction') = ${table.txHash}
        and ${table.facilitatorResponse}->>'network' = ${table.network}::text
        and lower(${table.facilitatorResponse}->>'payer') = lower(${table.payer})) is true`,
    ),
    check(
      "x402_resource_settlements_transaction_check",
      sql`${table.txHash} ~ '^0x[0-9a-f]{64}$'
        and ${table.explorerUrl} = 'https://sepolia.basescan.org/tx/' || ${table.txHash}`,
    ),
    check(
      "x402_resource_settlements_payment_identifier_check",
      sql`${table.paymentIdentifier} is null
        or (char_length(${table.paymentIdentifier}) between 1 and 256
          and ${table.paymentIdentifier} = btrim(${table.paymentIdentifier})
          and ${table.paymentIdentifier} ~ '[^[:space:]]')`,
    ),
    check(
      "x402_resource_settlements_fingerprint_check",
      sql`${table.paymentFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const x402ResourceSettlementAttempts = pgTable(
  "x402_resource_settlement_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    endpoint: text("endpoint").notNull(),
    facilitatorUrl: text("facilitator_url").notNull(),
    facilitatorResponse: jsonb("facilitator_response").$type<Record<string, unknown>>(),
    network: leashNetwork("network").notNull(),
    asset: varchar("asset", { length: 42 }).notNull(),
    amountAtomic: numeric("amount_atomic").notNull(),
    payer: varchar("payer", { length: 42 }).notNull(),
    payee: varchar("payee", { length: 42 }).notNull(),
    nonce: varchar("nonce", { length: 66 }).notNull(),
    authorizationValidAfter: timestamp("authorization_valid_after", {
      precision: 3,
      withTimezone: true,
    }).notNull(),
    authorizationValidBefore: timestamp("authorization_valid_before", {
      precision: 3,
      withTimezone: true,
    }).notNull(),
    startBlock: numeric("start_block").notNull(),
    txHash: varchar("tx_hash", { length: 66 }),
    paymentFingerprint: varchar("payment_fingerprint", { length: 64 }).notNull(),
    verificationAttempts: integer("verification_attempts").default(0).notNull(),
    lastErrorCode: varchar("last_error_code", { length: 64 }),
    startedAt: timestamp("started_at", { precision: 3, withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("x402_attempts_network_payer_nonce_unique").on(
      table.network,
      sql`lower(${table.payer})`,
      table.nonce,
    ),
    uniqueIndex("x402_attempts_network_tx_unique")
      .on(table.network, table.txHash)
      .where(sql`${table.txHash} is not null`),
    check(
      "x402_resource_settlement_attempts_profile_check",
      sql`${table.network} = 'eip155:84532'
        and lower(${table.asset}) = '0x036cbd53842c5426634e7929541ec2318f3dcf7e'
        and ${table.amountAtomic} = 1000`,
    ),
    check(
      "x402_resource_settlement_attempts_identity_check",
      sql`${table.payer} ~ '^0x[0-9a-fA-F]{40}$'
        and lower(${table.payer}) <> '0x0000000000000000000000000000000000000000'
        and ${table.payee} ~ '^0x[0-9a-fA-F]{40}$'
        and lower(${table.payee}) <> '0x0000000000000000000000000000000000000000'
        and ${table.nonce} ~ '^0x[0-9a-f]{64}$'
        and ${table.paymentFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "x402_resource_settlement_attempts_authorization_check",
      sql`${table.authorizationValidAfter} < ${table.authorizationValidBefore}
        and ${table.startBlock} >= 0 and ${table.startBlock} = trunc(${table.startBlock})`,
    ),
    check(
      "x402_resource_settlement_attempts_target_check",
      sql`${table.endpoint} ~ '^https://[^/?#[:space:]]+/api/x402/testnet$'
        and ${table.facilitatorUrl} = 'https://x402.org/facilitator'`,
    ),
    check(
      "x402_resource_settlement_attempts_result_check",
      sql`((${table.txHash} is null and ${table.facilitatorResponse} is null)
        or (${table.facilitatorResponse} is not null
          and ${table.txHash} ~ '^0x[0-9a-f]{64}$'
          and jsonb_typeof(${table.facilitatorResponse}) = 'object'
          and octet_length(${table.facilitatorResponse}::text) <= 32768
          and ${table.facilitatorResponse} @> '{"success":true}'::jsonb
          and lower(${table.facilitatorResponse}->>'transaction') = ${table.txHash}
          and ${table.facilitatorResponse}->>'network' = ${table.network}::text
          and lower(${table.facilitatorResponse}->>'payer') = lower(${table.payer}))) is true`,
    ),
    check(
      "x402_resource_settlement_attempts_retry_check",
      sql`${table.verificationAttempts} >= 0
        and (${table.lastErrorCode} is null
          or ${table.lastErrorCode} in ('receipt_not_propagated', 'rpc_unavailable'))
        and ${table.updatedAt} >= ${table.startedAt}`,
    ),
  ],
);

export const x402ResourceSettlementObservations = pgTable(
  "x402_resource_settlement_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    endpoint: text("endpoint").notNull(),
    facilitatorUrl: text("facilitator_url").notNull(),
    facilitatorResponse: jsonb("facilitator_response").$type<Record<string, unknown>>().notNull(),
    network: leashNetwork("network").notNull(),
    asset: varchar("asset", { length: 42 }).notNull(),
    amountAtomic: numeric("amount_atomic").notNull(),
    payer: varchar("payer", { length: 42 }).notNull(),
    payee: varchar("payee", { length: 42 }).notNull(),
    nonce: varchar("nonce", { length: 66 }).notNull(),
    authorizationValidAfter: timestamp("authorization_valid_after", {
      precision: 3,
      withTimezone: true,
    }).notNull(),
    authorizationValidBefore: timestamp("authorization_valid_before", {
      precision: 3,
      withTimezone: true,
    }).notNull(),
    txHash: varchar("tx_hash", { length: 66 }).notNull(),
    paymentFingerprint: varchar("payment_fingerprint", { length: 64 }).notNull(),
    verificationAttempts: integer("verification_attempts").notNull(),
    lastErrorCode: varchar("last_error_code", { length: 64 }).notNull(),
    lastCheckedAt: timestamp("last_checked_at", { precision: 3, withTimezone: true }).notNull(),
    observedAt: timestamp("observed_at", { precision: 3, withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("x402_observations_network_tx_unique").on(table.network, table.txHash),
    uniqueIndex("x402_observations_network_payer_nonce_unique").on(
      table.network,
      sql`lower(${table.payer})`,
      table.nonce,
    ),
    check(
      "x402_resource_settlement_observations_profile_check",
      sql`${table.network} = 'eip155:84532'
        and lower(${table.asset}) = '0x036cbd53842c5426634e7929541ec2318f3dcf7e'`,
    ),
    check("x402_resource_settlement_observations_amount_check", sql`${table.amountAtomic} = 1000`),
    check(
      "x402_resource_settlement_observations_address_check",
      sql`${table.payer} ~ '^0x[0-9a-fA-F]{40}$'
        and lower(${table.payer}) <> '0x0000000000000000000000000000000000000000'
        and ${table.payee} ~ '^0x[0-9a-fA-F]{40}$'
        and lower(${table.payee}) <> '0x0000000000000000000000000000000000000000'`,
    ),
    check(
      "x402_resource_settlement_observations_authorization_check",
      sql`${table.nonce} ~ '^0x[0-9a-f]{64}$'
        and ${table.authorizationValidAfter} < ${table.authorizationValidBefore}`,
    ),
    check(
      "x402_resource_settlement_observations_target_check",
      sql`${table.endpoint} ~ '^https://[^/?#[:space:]]+/api/x402/testnet$'
        and ${table.facilitatorUrl} = 'https://x402.org/facilitator'`,
    ),
    check(
      "x402_resource_settlement_observations_response_check",
      sql`(jsonb_typeof(${table.facilitatorResponse}) = 'object'
        and octet_length(${table.facilitatorResponse}::text) <= 32768
        and ${table.facilitatorResponse} @> '{"success":true}'::jsonb
        and lower(${table.facilitatorResponse}->>'transaction') = ${table.txHash}
        and ${table.facilitatorResponse}->>'network' = ${table.network}::text
        and lower(${table.facilitatorResponse}->>'payer') = lower(${table.payer})) is true`,
    ),
    check(
      "x402_resource_settlement_observations_transaction_check",
      sql`${table.txHash} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "x402_resource_settlement_observations_retry_check",
      sql`${table.verificationAttempts} > 0
        and ${table.paymentFingerprint} ~ '^[0-9a-f]{64}$'
        and ${table.lastErrorCode} in ('receipt_not_propagated', 'rpc_unavailable')
        and ${table.updatedAt} >= ${table.observedAt}
        and ${table.lastCheckedAt} between ${table.observedAt} and ${table.updatedAt}`,
    ),
  ],
);
