import type { reportPayment } from "./payment-report";

type PaymentReportResult = Awaited<ReturnType<typeof reportPayment>>;

const TEST_MODE_MESSAGE = "Test payments are simulated and do not move real funds.";

export function paymentReportResponseBody(paymentId: string, result: PaymentReportResult) {
  if (result.status === "settled") {
    return {
      payment: {
        id: paymentId,
        reportedTransactionId: result.reportedTransactionId,
        status: result.status,
        tokenChanges: result.tokenChanges,
        verification: {
          method: result.verificationMethod,
          verifiedAt: result.verifiedAt?.toISOString() ?? null,
        },
      },
      testMode: { message: TEST_MODE_MESSAGE, simulated: true as const },
    };
  }

  return {
    payment: {
      id: paymentId,
      reportedTransactionId: result.reportedTransactionId,
      status: result.status,
      verification: { method: null, verifiedAt: null },
    },
    verification: {
      code: "LIVE_SETTLEMENT_VERIFICATION_BLOCKED" as const,
      message:
        "Live payment evidence was recorded, but settlement remains pending until live verification is available.",
    },
  };
}
