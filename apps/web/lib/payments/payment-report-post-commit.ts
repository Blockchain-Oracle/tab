import type { Database } from "../db/client";
import { sendSettledReceiptEmail } from "../email/receipt-email";
import { dispatchWebhookAfterSettlement } from "../webhooks/deliver";
import type { reportPayment } from "./payment-report";
import { verifyLivePaymentById } from "./settlement-worker";

type PaymentReportResult = Awaited<ReturnType<typeof reportPayment>>;

export async function processPaymentReportAfterCommit(
  db: Database,
  paymentId: string,
  result: PaymentReportResult,
) {
  if (result.status === "pending") {
    await verifyLivePaymentById(db, paymentId, "inline");
    return;
  }
  await dispatchWebhookAfterSettlement(db, result.webhookDeliveryId);
  // Bounded send (4s timeout inside): the settlement is already committed,
  // and a failed email never fails the report — the outcome is only logged.
  const email = await sendSettledReceiptEmail(db, paymentId);
  if (email.state === "failed") {
    console.error("receipt email failed", paymentId, email.detail);
  }
}
