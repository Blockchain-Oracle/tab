import { and, desc, eq, isNull } from "drizzle-orm";

import type { Database } from "../db/client";
import { payments, settlements, webhookDeliveries } from "../db/schema";

const DASHBOARD_TRANSACTION_LIMIT = 20;

export interface DashboardTransactionPrincipal {
  env: "live" | "test";
  merchantId: string;
}

export interface DashboardTransaction {
  amountUsd: string;
  createdAt: Date;
  currency: string;
  env: "live" | "test";
  payerType: "agent" | "human";
  paymentId: string;
  refCode: string;
  reportedTransactionId: string | null;
  settlement: {
    id: string;
    particleTransactionId: string;
    txHash: string | null;
    verificationMethod: "particle" | "rpc" | "simulated_test" | "x402_receipt";
    verifiedAt: Date;
  } | null;
  status: "failed" | "pending" | "settled";
  webhook: {
    attempt: number;
    completedAt: Date | null;
    id: string;
    nextRetryAt: Date | null;
    responseTimeMs: number | null;
    result: "delivered" | "failed" | "gave_up" | "pending" | "retrying" | "timeout";
    statusCode: number | null;
  } | null;
}

export async function listDashboardTransactions(
  db: Database,
  principal: DashboardTransactionPrincipal,
) {
  const result = await db
    .select({
      payment: {
        amountUsd: payments.amountUsd,
        createdAt: payments.createdAt,
        currency: payments.currency,
        env: payments.env,
        payerType: payments.payerType,
        paymentId: payments.id,
        refCode: payments.refCode,
        reportedTransactionId: payments.reportedTransactionId,
        status: payments.status,
      },
      settlement: {
        id: settlements.id,
        particleTransactionId: settlements.particleTransactionId,
        txHash: settlements.txHash,
        verificationMethod: settlements.verificationMethod,
        verifiedAt: settlements.verifiedAt,
      },
      webhook: {
        attempt: webhookDeliveries.attempt,
        completedAt: webhookDeliveries.completedAt,
        id: webhookDeliveries.id,
        nextRetryAt: webhookDeliveries.nextRetryAt,
        responseTimeMs: webhookDeliveries.responseTimeMs,
        result: webhookDeliveries.result,
        statusCode: webhookDeliveries.statusCode,
      },
    })
    .from(payments)
    .leftJoin(settlements, eq(settlements.paymentId, payments.id))
    .leftJoin(
      webhookDeliveries,
      and(
        eq(webhookDeliveries.paymentId, payments.id),
        eq(webhookDeliveries.settlementId, settlements.id),
        eq(webhookDeliveries.merchantId, payments.merchantId),
        eq(webhookDeliveries.env, payments.env),
        eq(webhookDeliveries.type, "payment"),
        eq(webhookDeliveries.trigger, "auto"),
        isNull(webhookDeliveries.supersededById),
      ),
    )
    .where(and(eq(payments.merchantId, principal.merchantId), eq(payments.env, principal.env)))
    .orderBy(desc(payments.createdAt), desc(payments.id))
    .limit(DASHBOARD_TRANSACTION_LIMIT + 1);

  return {
    hasMore: result.length > DASHBOARD_TRANSACTION_LIMIT,
    rows: result.slice(0, DASHBOARD_TRANSACTION_LIMIT).map(
      ({ payment, settlement, webhook }): DashboardTransaction => ({
        ...payment,
        settlement,
        webhook,
      }),
    ),
  };
}
