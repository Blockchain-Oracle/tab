import { type SQL, sql } from "drizzle-orm";
import * as pg from "drizzle-orm/pg-core";

import { environment } from "./identity-schema";
import { payments, settlements } from "./payment-schema";
import { webhookDeliveryChecks } from "./webhook-delivery-checks";
import {
  webhookDeliveryResult,
  webhookDeliveryTrigger,
  webhookDeliveryType,
  webhookFailureKind,
} from "./webhook-delivery-enums";
import { webhookEndpoints } from "./webhook-endpoint-schema";

export * from "./webhook-delivery-enums";
export * from "./webhook-endpoint-schema";

export const webhookDeliveries = pg.pgTable(
  "webhook_deliveries",
  {
    id: pg.uuid("id").defaultRandom().primaryKey(),
    endpointId: pg.uuid("endpoint_id").notNull(),
    merchantId: pg.uuid("merchant_id").notNull(),
    env: environment("env").notNull(),
    paymentId: pg.uuid("payment_id"),
    settlementId: pg.uuid("settlement_id"),
    eventId: pg.text("event_id").notNull(),
    retryChainId: pg.uuid("retry_chain_id").notNull(),
    requestBody: pg.text("request_body").notNull(),
    requestBodyHash: pg
      .varchar("request_body_hash", { length: 64 })
      .notNull()
      .generatedAlwaysAs(
        (): SQL => sql`encode(digest(${webhookDeliveries.requestBody}, 'sha256'), 'hex')`,
      ),
    type: webhookDeliveryType("type").notNull(),
    trigger: webhookDeliveryTrigger("trigger").notNull(),
    attempt: pg.integer("attempt").notNull(),
    result: webhookDeliveryResult("result").default("pending").notNull(),
    failureKind: webhookFailureKind("failure_kind"),
    signatureHeader: pg.text("signature_header"),
    statusCode: pg.integer("status_code"),
    responseBodySnippet: pg.varchar("response_body_snippet", { length: 500 }),
    responseTimeMs: pg.integer("response_time_ms"),
    nextRetryAt: pg.timestamp("next_retry_at", { withTimezone: true }),
    leaseToken: pg.uuid("lease_token"),
    leaseExpiresAt: pg.timestamp("lease_expires_at", { withTimezone: true }),
    parentDeliveryId: pg.uuid("parent_delivery_id"),
    parentAttempt: pg.integer("parent_attempt"),
    supersededById: pg.uuid("superseded_by_id"),
    supersededByAttempt: pg.integer("superseded_by_attempt"),
    startedAt: pg.timestamp("started_at", { withTimezone: true }),
    completedAt: pg.timestamp("completed_at", { withTimezone: true }),
    createdAt: pg.timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table): pg.PgTableExtraConfigValue[] => [
    pg.foreignKey({
      columns: [table.endpointId, table.merchantId, table.env],
      foreignColumns: [webhookEndpoints.id, webhookEndpoints.merchantId, webhookEndpoints.env],
      name: "webhook_deliveries_endpoint_scope_fk",
    }),
    pg.foreignKey({
      columns: [table.paymentId, table.merchantId, table.env],
      foreignColumns: [payments.id, payments.merchantId, payments.env],
      name: "webhook_deliveries_payment_scope_fk",
    }),
    pg.foreignKey({
      columns: [table.settlementId, table.paymentId],
      foreignColumns: [settlements.id, settlements.paymentId],
      name: "webhook_deliveries_settlement_payment_fk",
    }),
    pg.foreignKey({
      columns: [
        table.retryChainId,
        table.endpointId,
        table.merchantId,
        table.env,
        table.eventId,
        table.requestBodyHash,
        table.type,
        table.trigger,
      ],
      foreignColumns: [
        webhookDeliveries.id,
        webhookDeliveries.endpointId,
        webhookDeliveries.merchantId,
        webhookDeliveries.env,
        webhookDeliveries.eventId,
        webhookDeliveries.requestBodyHash,
        webhookDeliveries.type,
        webhookDeliveries.trigger,
      ],
      name: "webhook_deliveries_chain_scope_fk",
    }),
    pg.foreignKey({
      columns: [table.retryChainId, table.paymentId, table.settlementId],
      foreignColumns: [
        webhookDeliveries.id,
        webhookDeliveries.paymentId,
        webhookDeliveries.settlementId,
      ],
      name: "webhook_deliveries_chain_evidence_fk",
    }),
    pg.foreignKey({
      columns: [
        table.parentDeliveryId,
        table.endpointId,
        table.merchantId,
        table.env,
        table.eventId,
        table.requestBodyHash,
        table.type,
      ],
      foreignColumns: [
        webhookDeliveries.id,
        webhookDeliveries.endpointId,
        webhookDeliveries.merchantId,
        webhookDeliveries.env,
        webhookDeliveries.eventId,
        webhookDeliveries.requestBodyHash,
        webhookDeliveries.type,
      ],
      name: "webhook_deliveries_parent_scope_fk",
    }),
    pg.foreignKey({
      columns: [table.parentDeliveryId, table.paymentId, table.settlementId],
      foreignColumns: [
        webhookDeliveries.id,
        webhookDeliveries.paymentId,
        webhookDeliveries.settlementId,
      ],
      name: "webhook_deliveries_parent_evidence_fk",
    }),
    pg.foreignKey({
      columns: [table.parentDeliveryId, table.retryChainId, table.parentAttempt],
      foreignColumns: [
        webhookDeliveries.id,
        webhookDeliveries.retryChainId,
        webhookDeliveries.attempt,
      ],
      name: "webhook_deliveries_parent_sequence_fk",
    }),
    pg.foreignKey({
      columns: [table.supersededById, table.id, table.retryChainId, table.supersededByAttempt],
      foreignColumns: [
        webhookDeliveries.id,
        webhookDeliveries.parentDeliveryId,
        webhookDeliveries.retryChainId,
        webhookDeliveries.attempt,
      ],
      name: "webhook_deliveries_successor_scope_fk",
    }),
    pg
      .unique("webhook_deliveries_id_chain_scope_unique")
      .on(
        table.id,
        table.endpointId,
        table.merchantId,
        table.env,
        table.eventId,
        table.requestBodyHash,
        table.type,
        table.trigger,
      ),
    pg.unique("webhook_deliveries_id_tenant_unique").on(table.id, table.merchantId, table.env),
    pg
      .unique("webhook_deliveries_id_event_scope_unique")
      .on(
        table.id,
        table.endpointId,
        table.merchantId,
        table.env,
        table.eventId,
        table.requestBodyHash,
        table.type,
      ),
    pg
      .unique("webhook_deliveries_id_evidence_unique")
      .on(table.id, table.paymentId, table.settlementId),
    pg
      .unique("webhook_deliveries_id_retry_attempt_unique")
      .on(table.id, table.retryChainId, table.attempt),
    pg
      .unique("webhook_deliveries_id_parent_chain_attempt_unique")
      .on(table.id, table.parentDeliveryId, table.retryChainId, table.attempt),
    pg.uniqueIndex("webhook_deliveries_chain_attempt_unique").on(table.retryChainId, table.attempt),
    pg
      .uniqueIndex("webhook_deliveries_automatic_settlement_root_unique")
      .on(table.settlementId)
      .where(sql`${table.trigger} = 'auto' and ${table.type} = 'payment' and ${table.attempt} = 1`),
    pg.index("webhook_deliveries_due_idx").on(table.result, table.nextRetryAt, table.createdAt),
    pg.index("webhook_deliveries_event_idx").on(table.eventId),
    ...webhookDeliveryChecks(table),
  ],
);
