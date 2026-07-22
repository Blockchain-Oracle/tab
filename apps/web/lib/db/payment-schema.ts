import { sql } from "drizzle-orm";
import {
  boolean,
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

import { citext, environment, merchants } from "./identity-schema";

export const paymentStatus = pgEnum("payment_status", ["pending", "settled", "failed"]);
export const payerType = pgEnum("payer_type", ["human", "agent"]);
export const settlementVerificationMethod = pgEnum("settlement_verification_method", [
  "rpc",
  "particle",
  "x402_receipt",
  "simulated_test",
]);
export const settlementVerificationTrigger = pgEnum("settlement_verification_trigger", [
  "inline",
  "cron_sweep",
]);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    refCode: text("ref_code").notNull(),
    env: environment("env").notNull(),
    livemode: boolean("livemode").notNull(),
    amountUsd: numeric("amount_usd").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    receiver: varchar("receiver", { length: 42 }).notNull(),
    tokenAddress: varchar("token_address", { length: 42 }).notNull(),
    tokenChainId: integer("token_chain_id").notNull(),
    intentUrl: text("intent_url").notNull(),
    payerType: payerType("payer_type").default("human").notNull(),
    payerEmail: citext("payer_email"),
    payerAddress: varchar("payer_address", { length: 42 }),
    status: paymentStatus("status").default("pending").notNull(),
    failureReason: text("failure_reason"),
    reportedTransactionId: text("reported_transaction_id"),
    reportedTokenChanges: jsonb("reported_token_changes").$type<unknown[]>(),
    reportedAt: timestamp("reported_at", { withTimezone: true }),
    verificationNextAttemptAt: timestamp("verification_next_attempt_at", { withTimezone: true }),
    verificationLeaseToken: uuid("verification_lease_token"),
    verificationLeaseExpiresAt: timestamp("verification_lease_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (table) => [
    unique("payments_id_merchant_env_unique").on(table.id, table.merchantId, table.env),
    unique("payments_ref_merchant_env_unique").on(table.refCode, table.merchantId, table.env),
    uniqueIndex("payments_ref_code_unique").on(table.refCode),
    uniqueIndex("payments_settlement_evidence_unique").on(
      table.id,
      table.reportedTransactionId,
      table.livemode,
    ),
    index("payments_reported_transaction_id_idx").on(table.reportedTransactionId),
    index("payments_merchant_env_created_idx").on(
      table.merchantId,
      table.env,
      table.createdAt.desc(),
    ),
    index("payments_pending_sweep_idx").on(table.status, table.createdAt),
    index("payments_verification_sweep_idx").on(
      table.env,
      table.status,
      table.reportedAt,
      table.verificationNextAttemptAt,
    ),
    check("payments_ref_code_check", sql`${table.refCode} ~ '^TAB-[A-Z0-9]+$'`),
    check(
      "payments_amount_check",
      sql`${table.amountUsd} > 0 and ${table.amountUsd} < 100000000000000
        and scale(${table.amountUsd}) <= 6`,
    ),
    check("payments_currency_check", sql`${table.currency} = 'USD'`),
    // Token identity must be a known (chain, USDC) pair: Arbitrum One for
    // live, Base Sepolia for test. Env pairing is enforced in app code so
    // pre-existing test rows minted with the Arbitrum identity stay valid.
    check(
      "payments_chain_check",
      sql`(${table.tokenChainId} = 42161 and lower(${table.tokenAddress}) = '0xaf88d065e77c8cc2239327c5edb3a432268e5831')
        or (${table.tokenChainId} = 84532 and lower(${table.tokenAddress}) = '0x036cbd53842c5426634e7929541ec2318f3dcf7e')`,
    ),
    check(
      "payments_receiver_check",
      sql`${table.receiver} ~ '^0x[0-9a-fA-F]{40}$'
        and lower(${table.receiver}) <> '0x0000000000000000000000000000000000000000'`,
    ),
    check(
      "payments_payer_address_check",
      sql`${table.payerAddress} is null or (${table.payerAddress} ~ '^0x[0-9a-fA-F]{40}$'
        and lower(${table.payerAddress}) <> '0x0000000000000000000000000000000000000000')`,
    ),
    check(
      "payments_livemode_check",
      sql`(${table.env} = 'live' and ${table.livemode})
        or (${table.env} = 'test' and not ${table.livemode})`,
    ),
    check(
      "payments_report_check",
      sql`(${table.reportedTransactionId} is null and ${table.reportedTokenChanges} is null and ${table.reportedAt} is null)
        or (${table.reportedTransactionId} is not null and btrim(${table.reportedTransactionId}) <> ''
          and ${table.reportedTokenChanges} is not null
          and jsonb_typeof(${table.reportedTokenChanges}) = 'array' and ${table.reportedAt} is not null)`,
    ),
    check(
      "payments_settled_at_check",
      sql`(${table.status} = 'settled' and ${table.settledAt} is not null)
        or (${table.status} <> 'settled' and ${table.settledAt} is null)`,
    ),
    check(
      "payments_verification_lease_check",
      sql`(${table.verificationLeaseToken} is null and ${table.verificationLeaseExpiresAt} is null)
        or (${table.verificationLeaseToken} is not null
          and ${table.verificationLeaseExpiresAt} is not null and ${table.env} = 'live'
          and ${table.status} = 'pending' and ${table.reportedAt} is not null
          and ${table.reportedTransactionId} is not null and ${table.payerAddress} is not null)`,
    ),
    check(
      "payments_verification_schedule_check",
      sql`${table.verificationNextAttemptAt} is null
        or (${table.env} = 'live' and ${table.reportedAt} is not null)`,
    ),
    check(
      "payments_failure_reason_check",
      sql`(${table.status} = 'failed' and ${table.failureReason} is not null)
        or (${table.status} <> 'failed' and ${table.failureReason} is null)`,
    ),
  ],
);

export const settlements = pgTable(
  "settlements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    paymentId: uuid("payment_id").notNull(),
    particleTransactionId: text("particle_transaction_id").notNull(),
    txHash: varchar("tx_hash", { length: 66 }),
    tokenChangesJson: jsonb("token_changes_json").$type<unknown[]>().notNull(),
    amountAtomic: numeric("amount_atomic").notNull(),
    verificationMethod: settlementVerificationMethod("verification_method").notNull(),
    verificationTrigger: settlementVerificationTrigger("verification_trigger").notNull(),
    livemode: boolean("livemode").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("settlements_id_payment_unique").on(table.id, table.paymentId),
    uniqueIndex("settlements_payment_id_unique").on(table.paymentId),
    uniqueIndex("settlements_particle_transaction_id_unique").on(table.particleTransactionId),
    foreignKey({
      columns: [table.paymentId, table.particleTransactionId, table.livemode],
      foreignColumns: [payments.id, payments.reportedTransactionId, payments.livemode],
      name: "settlements_payment_evidence_fk",
    }),
    check(
      "settlements_amount_atomic_check",
      sql`${table.amountAtomic} > 0 and ${table.amountAtomic} = trunc(${table.amountAtomic})
        and ${table.amountAtomic} < 1000000000000000000000000000000000000000000000000000000000000000000000000000000`,
    ),
    check(
      "settlements_token_changes_check",
      sql`jsonb_typeof(${table.tokenChangesJson}) = 'array'`,
    ),
    check(
      "settlements_tx_hash_check",
      sql`${table.txHash} is null or ${table.txHash} ~ '^0x[0-9a-fA-F]{64}$'`,
    ),
    // simulated_test stays testnet-only; rpc verification is honest on both
    // networks (real Base Sepolia settlement in test, Arbitrum One in live).
    check(
      "settlements_simulation_check",
      sql`(${table.verificationMethod} = 'simulated_test' and not ${table.livemode})
        or ${table.verificationMethod} = 'rpc'
        or (${table.verificationMethod} <> 'simulated_test' and ${table.livemode})`,
    ),
  ],
);
