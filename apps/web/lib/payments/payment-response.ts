import type { payments } from "../db/schema";

type Payment = typeof payments.$inferSelect;

export function paymentResponse(payment: Payment) {
  return {
    amount: payment.amountUsd,
    createdAt: payment.createdAt.toISOString(),
    currency: payment.currency,
    env: payment.env,
    failureReason: payment.failureReason,
    id: payment.id,
    intentUrl: payment.intentUrl,
    livemode: payment.livemode,
    payerAddress: payment.payerAddress,
    payerEmail: payment.payerEmail,
    payerType: payment.payerType,
    refCode: payment.refCode,
    reportedAt: payment.reportedAt?.toISOString() ?? null,
    settledAt: payment.settledAt?.toISOString() ?? null,
    status: payment.status,
    token: {
      address: payment.tokenAddress,
      chainId: payment.tokenChainId,
    },
    transactionId: payment.reportedTransactionId,
  };
}
