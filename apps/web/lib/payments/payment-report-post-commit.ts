import type { Database } from "../db/client";
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
}
