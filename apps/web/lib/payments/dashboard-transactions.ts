import { and, asc, desc, eq, gt, isNull, lt, or, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Database } from "../db/client";
import { payments, settlements, webhookDeliveries } from "../db/schema";

const DASHBOARD_TRANSACTION_LIMIT = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DashboardPaymentStatus = "failed" | "pending" | "settled";
export type DashboardPayerType = "agent" | "human";
export type DashboardWebhookResult =
  | "delivered"
  | "failed"
  | "gave_up"
  | "none"
  | "pending"
  | "retrying"
  | "timeout";

export interface DashboardTransactionPrincipal {
  env: "live" | "test";
  merchantId: string;
}

export interface DashboardTransactionQuery {
  cursor?: string;
  payerType?: DashboardPayerType;
  status?: DashboardPaymentStatus;
  webhookResult?: DashboardWebhookResult;
}

export interface DashboardTransaction {
  amountUsd: string;
  createdAt: Date;
  currency: string;
  env: "live" | "test";
  failureReason: string | null;
  intentUrl: string;
  payerAddress: string | null;
  payerType: DashboardPayerType;
  paymentId: string;
  receiver: string;
  refCode: string;
  reportedAt: Date | null;
  reportedTokenChanges: unknown[] | null;
  reportedTransactionId: string | null;
  settledAt: Date | null;
  settlement: {
    amountAtomic: string;
    id: string;
    particleTransactionId: string;
    tokenChanges: unknown[];
    txHash: string | null;
    verificationMethod: "particle" | "rpc" | "simulated_test" | "x402_receipt";
    verificationTrigger: "cron_sweep" | "inline";
    verifiedAt: Date;
  } | null;
  status: DashboardPaymentStatus;
  tokenAddress: string;
  tokenChainId: number;
  webhook: {
    attempt: number;
    completedAt: Date | null;
    id: string;
    nextRetryAt: Date | null;
    responseTimeMs: number | null;
    result: Exclude<DashboardWebhookResult, "none">;
    statusCode: number | null;
  } | null;
}

interface CursorPayload {
  createdAt: Date;
  direction: "newer" | "older";
  paymentId: string;
}

function latestPaymentWebhook(db: Database) {
  const candidate = alias(webhookDeliveries, "dashboard_payment_webhook_candidate");
  return db
    .select({
      attempt: candidate.attempt,
      completedAt: candidate.completedAt,
      id: candidate.id,
      nextRetryAt: candidate.nextRetryAt,
      responseTimeMs: candidate.responseTimeMs,
      result: candidate.result,
      statusCode: candidate.statusCode,
    })
    .from(candidate)
    .where(
      and(
        eq(candidate.paymentId, payments.id),
        eq(candidate.settlementId, settlements.id),
        eq(candidate.merchantId, payments.merchantId),
        eq(candidate.env, payments.env),
        eq(candidate.type, "payment"),
        isNull(candidate.supersededById),
      ),
    )
    .orderBy(desc(candidate.createdAt), desc(candidate.id))
    .limit(1)
    .as("dashboard_latest_payment_webhook");
}

type LatestPaymentWebhook = ReturnType<typeof latestPaymentWebhook>;

function selectDashboardRows(db: Database) {
  const webhook = latestPaymentWebhook(db);
  const query = db
    .select({
      payment: {
        amountUsd: payments.amountUsd,
        createdAt: payments.createdAt,
        currency: payments.currency,
        env: payments.env,
        failureReason: payments.failureReason,
        intentUrl: payments.intentUrl,
        payerAddress: payments.payerAddress,
        payerType: payments.payerType,
        paymentId: payments.id,
        receiver: payments.receiver,
        refCode: payments.refCode,
        reportedAt: payments.reportedAt,
        reportedTokenChanges: payments.reportedTokenChanges,
        reportedTransactionId: payments.reportedTransactionId,
        settledAt: payments.settledAt,
        status: payments.status,
        tokenAddress: payments.tokenAddress,
        tokenChainId: payments.tokenChainId,
      },
      settlement: {
        amountAtomic: settlements.amountAtomic,
        id: settlements.id,
        particleTransactionId: settlements.particleTransactionId,
        tokenChanges: settlements.tokenChangesJson,
        txHash: settlements.txHash,
        verificationMethod: settlements.verificationMethod,
        verificationTrigger: settlements.verificationTrigger,
        verifiedAt: settlements.verifiedAt,
      },
      webhook: {
        attempt: webhook.attempt,
        completedAt: webhook.completedAt,
        id: webhook.id,
        nextRetryAt: webhook.nextRetryAt,
        responseTimeMs: webhook.responseTimeMs,
        result: webhook.result,
        statusCode: webhook.statusCode,
      },
    })
    .from(payments)
    .leftJoin(settlements, eq(settlements.paymentId, payments.id))
    .leftJoinLateral(webhook, sql`true`);
  return { query, webhook };
}

type SelectedDashboardRow = Awaited<ReturnType<typeof selectDashboardRows>["query"]>[number];

function mapDashboardRow({ payment, settlement, webhook }: SelectedDashboardRow) {
  return { ...payment, settlement, webhook } satisfies DashboardTransaction;
}

function encodeCursor(row: DashboardTransaction, direction: CursorPayload["direction"]) {
  return Buffer.from(
    JSON.stringify({ createdAt: row.createdAt.toISOString(), direction, paymentId: row.paymentId }),
  ).toString("base64url");
}

function decodeCursor(value?: string): CursorPayload | null {
  if (!value || value.length > 512) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    const createdAt = new Date(String(parsed.createdAt));
    if (
      Number.isNaN(createdAt.valueOf()) ||
      (parsed.direction !== "newer" && parsed.direction !== "older") ||
      typeof parsed.paymentId !== "string" ||
      !UUID.test(parsed.paymentId)
    ) {
      return null;
    }
    return { createdAt, direction: parsed.direction, paymentId: parsed.paymentId };
  } catch {
    return null;
  }
}

function cursorCondition(cursor: CursorPayload): SQL {
  const dateComparison = cursor.direction === "older" ? lt : gt;
  const idComparison = cursor.direction === "older" ? lt : gt;
  return or(
    dateComparison(payments.createdAt, cursor.createdAt),
    and(eq(payments.createdAt, cursor.createdAt), idComparison(payments.id, cursor.paymentId)),
  ) as SQL;
}

function queryConditions(
  principal: DashboardTransactionPrincipal,
  query: DashboardTransactionQuery,
  cursor: CursorPayload | null,
  webhook: LatestPaymentWebhook,
) {
  const conditions: SQL[] = [
    eq(payments.merchantId, principal.merchantId),
    eq(payments.env, principal.env),
  ];
  if (query.status) conditions.push(eq(payments.status, query.status));
  if (query.payerType) conditions.push(eq(payments.payerType, query.payerType));
  if (query.webhookResult === "none") conditions.push(isNull(webhook.id));
  else if (query.webhookResult) conditions.push(eq(webhook.result, query.webhookResult));
  if (cursor) conditions.push(cursorCondition(cursor));
  return conditions;
}

export async function listDashboardTransactions(
  db: Database,
  principal: DashboardTransactionPrincipal,
  query: DashboardTransactionQuery = {},
) {
  const cursor = decodeCursor(query.cursor);
  const newer = cursor?.direction === "newer";
  const selection = selectDashboardRows(db);
  const result = await selection.query
    .where(and(...queryConditions(principal, query, cursor, selection.webhook)))
    .orderBy(
      newer ? asc(payments.createdAt) : desc(payments.createdAt),
      newer ? asc(payments.id) : desc(payments.id),
    )
    .limit(DASHBOARD_TRANSACTION_LIMIT + 1);

  const directionalMore = result.length > DASHBOARD_TRANSACTION_LIMIT;
  const selected = result.slice(0, DASHBOARD_TRANSACTION_LIMIT).map(mapDashboardRow);
  const rows = newer ? selected.reverse() : selected;
  const first = rows[0];
  const last = rows.at(-1);
  const previousCursor =
    first && cursor && (!newer || directionalMore) ? encodeCursor(first, "newer") : null;
  const nextCursor =
    last && ((!newer && directionalMore) || newer) ? encodeCursor(last, "older") : null;

  return { hasMore: Boolean(nextCursor), nextCursor, previousCursor, rows };
}

export async function getDashboardTransaction(
  db: Database,
  principal: DashboardTransactionPrincipal,
  paymentId: string,
) {
  if (!UUID.test(paymentId)) return null;
  const selection = selectDashboardRows(db);
  const [row] = await selection.query
    .where(
      and(
        eq(payments.id, paymentId),
        eq(payments.merchantId, principal.merchantId),
        eq(payments.env, principal.env),
      ),
    )
    .limit(1);
  return row ? mapDashboardRow(row) : null;
}
