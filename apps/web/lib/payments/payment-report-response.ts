import type { reportPayment } from "./payment-report";

type PaymentReportResult = Awaited<ReturnType<typeof reportPayment>>;

const TEST_MODE_MESSAGE =
  "Sandbox settlement — real USDC moved on Base Sepolia testnet; no real-world value.";

export function paymentReportResponseBody(
  paymentId: string,
  result: PaymentReportResult,
  env: "live" | "test",
) {
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
      testMode: { message: TEST_MODE_MESSAGE, network: "eip155:84532" as const },
    };
  }

  return {
    payment: {
      id: paymentId,
      reportedTransactionId: result.reportedTransactionId,
      status: result.status,
      verification: { method: null, verifiedAt: null },
    },
    verification:
      env === "test"
        ? {
            code: "TEST_SETTLEMENT_PENDING" as const,
            message: "The Base Sepolia transaction is not yet indexed. Report again shortly.",
          }
        : {
            code: "LIVE_SETTLEMENT_VERIFICATION_BLOCKED" as const,
            message:
              "Live payment evidence was recorded, but settlement remains pending until live verification is available.",
          },
  };
}
