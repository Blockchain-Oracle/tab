import { sql } from "drizzle-orm";
import { type AnyPgColumn, check, type PgTableExtraConfigValue } from "drizzle-orm/pg-core";

type DeliveryCheckColumns = Record<
  | "attempt"
  | "completedAt"
  | "eventId"
  | "failureKind"
  | "id"
  | "leaseExpiresAt"
  | "leaseToken"
  | "nextRetryAt"
  | "parentAttempt"
  | "parentDeliveryId"
  | "paymentId"
  | "requestBodyHash"
  | "responseBodySnippet"
  | "responseTimeMs"
  | "result"
  | "retryChainId"
  | "settlementId"
  | "signatureHeader"
  | "startedAt"
  | "statusCode"
  | "supersededByAttempt"
  | "supersededById"
  | "type",
  AnyPgColumn
>;

export function webhookDeliveryChecks(table: DeliveryCheckColumns): PgTableExtraConfigValue[] {
  return [
    check("webhook_deliveries_event_id_check", sql`${table.eventId} ~ '^evt_[A-Za-z0-9_-]+$'`),
    check("webhook_deliveries_body_hash_check", sql`${table.requestBodyHash} ~ '^[0-9a-f]{64}$'`),
    check(
      "webhook_deliveries_chain_root_check",
      sql`((${table.attempt} = 1 and ${table.retryChainId} = ${table.id}
          and ${table.parentAttempt} is null)
        or (${table.attempt} > 1 and ${table.retryChainId} <> ${table.id}
          and ${table.parentDeliveryId} is not null
          and ${table.parentAttempt} = ${table.attempt} - 1))
        and (${table.parentDeliveryId} is null or ${table.parentDeliveryId} <> ${table.id})`,
    ),
    check("webhook_deliveries_attempt_check", sql`${table.attempt} between 1 and 3`),
    check(
      "webhook_deliveries_type_check",
      sql`(${table.type} = 'payment' and ${table.paymentId} is not null
          and ${table.settlementId} is not null)
        or (${table.type} = 'test' and ${table.paymentId} is null
          and ${table.settlementId} is null)`,
    ),
    check(
      "webhook_deliveries_status_code_check",
      sql`${table.statusCode} is null or ${table.statusCode} between 100 and 599`,
    ),
    check(
      "webhook_deliveries_response_time_check",
      sql`${table.responseTimeMs} is null or ${table.responseTimeMs} >= 0`,
    ),
    check(
      "webhook_deliveries_signature_check",
      sql`${table.signatureHeader} is null
        or ${table.signatureHeader} ~ '^t=[0-9]+,v1=[0-9a-f]{64}$'`,
    ),
    check(
      "webhook_deliveries_lease_check",
      sql`(${table.leaseToken} is null and ${table.leaseExpiresAt} is null)
        or (${table.leaseToken} is not null and ${table.leaseExpiresAt} is not null)`,
    ),
    check(
      "webhook_deliveries_successor_check",
      sql`(${table.supersededById} is null and ${table.supersededByAttempt} is null)
        or (${table.supersededById} is not null
          and ${table.supersededById} <> ${table.id}
          and ${table.supersededByAttempt} = ${table.attempt} + 1
          and ${table.supersededByAttempt} between 2 and 3)`,
    ),
    check(
      "webhook_deliveries_result_check",
      sql`coalesce(((${table.result} = 'pending' and ${table.completedAt} is null
          and ${table.failureKind} is null and ${table.nextRetryAt} is null
          and ${table.statusCode} is null and ${table.responseTimeMs} is null
          and ${table.responseBodySnippet} is null and ${table.supersededById} is null)
        or (${table.result} = 'delivered' and ${table.completedAt} is not null
          and ${table.failureKind} is null and ${table.nextRetryAt} is null
          and ${table.statusCode} between 200 and 299
          and ${table.signatureHeader} is not null and ${table.startedAt} is not null
          and ${table.responseTimeMs} is not null and ${table.leaseToken} is null
          and ${table.leaseExpiresAt} is null and ${table.supersededById} is null)
        or (${table.result} = 'retrying' and ${table.completedAt} is not null
          and ${table.failureKind} in ('http', 'network', 'timeout')
          and ${table.nextRetryAt} is not null and ${table.attempt} < 3
          and ${table.signatureHeader} is not null and ${table.startedAt} is not null
          and ${table.responseTimeMs} is not null and ${table.leaseToken} is null
          and ${table.leaseExpiresAt} is null and ${table.supersededById} is null
          and ((${table.failureKind} = 'http' and (${table.statusCode} < 200
              or ${table.statusCode} > 299))
            or (${table.failureKind} in ('network', 'timeout') and ${table.statusCode} is null)))
        or (${table.result} in ('failed', 'timeout') and ${table.attempt} < 3
          and ${table.completedAt} is not null and ${table.nextRetryAt} is null
          and ${table.signatureHeader} is not null and ${table.startedAt} is not null
          and ${table.responseTimeMs} is not null and ${table.leaseToken} is null
          and ${table.leaseExpiresAt} is null and ${table.supersededById} is not null
          and ((${table.result} = 'failed' and ${table.failureKind} in ('http', 'network'))
            or (${table.result} = 'timeout' and ${table.failureKind} = 'timeout'))
          and ((${table.failureKind} = 'http' and (${table.statusCode} < 200
              or ${table.statusCode} > 299))
            or (${table.failureKind} in ('network', 'timeout') and ${table.statusCode} is null)))
        or (${table.result} = 'failed' and ${table.failureKind} = 'configuration'
          and ${table.completedAt} is not null and ${table.nextRetryAt} is null
          and ${table.signatureHeader} is null and ${table.statusCode} is null
          and ${table.responseTimeMs} is null and ${table.leaseToken} is null
          and ${table.leaseExpiresAt} is null and ${table.supersededById} is null)
        or (${table.result} = 'gave_up' and ${table.attempt} = 3
          and ${table.completedAt} is not null
          and ${table.failureKind} in ('http', 'network', 'timeout')
          and ${table.nextRetryAt} is null and ${table.signatureHeader} is not null
          and ${table.startedAt} is not null and ${table.responseTimeMs} is not null
          and ${table.leaseToken} is null and ${table.leaseExpiresAt} is null
          and ${table.supersededById} is null
          and ((${table.failureKind} = 'http' and (${table.statusCode} < 200
              or ${table.statusCode} > 299))
            or (${table.failureKind} in ('network', 'timeout') and ${table.statusCode} is null)))), false)`,
    ),
  ];
}
