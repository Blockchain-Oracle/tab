import { and, eq, sql } from "drizzle-orm";

import type { ApiEnvironment } from "../auth/api-key";
import type { Database } from "../db/client";
import { payments, settlements } from "../db/schema";
import { enqueuePaymentSettledWebhook, findPaymentWebhookDeliveryId } from "../webhooks/enqueue";
import { samePaymentReportEvidence, usdcAtomicAmount } from "./payment-report-values";
import {
  type TestTransferVerdict,
  type TestTransferVerifier,
  verifyTestTransfer,
} from "./verify-test";

export interface PaymentReportEvidence {
  tokenChanges: unknown[];
  transactionId: string;
}

export interface ValidatedBuyerIdentity {
  payerAddress: string;
  payerEmail: string;
}

export class PaymentNotFoundError extends Error {
  readonly code = "PAYMENT_NOT_FOUND";

  constructor() {
    super("Payment was not found.");
    this.name = "PaymentNotFoundError";
  }
}

export class PaymentReportConflictError extends Error {
  readonly code = "PAYMENT_REPORT_CONFLICT";

  constructor() {
    super("The payment already has different report evidence.");
    this.name = "PaymentReportConflictError";
  }
}

export class PaymentVerificationFailedError extends Error {
  readonly code = "PAYMENT_VERIFICATION_FAILED";

  constructor(reason: string) {
    super(`The reported transaction could not be verified on-chain: ${reason}`);
    this.name = "PaymentVerificationFailedError";
  }
}

const TX_HASH = /^0x[0-9a-f]{64}$/i;

class PaymentReportStateError extends Error {
  constructor() {
    super("Payment report state is inconsistent");
    this.name = "PaymentReportStateError";
  }
}

function uniqueConstraint(error: unknown) {
  const seen = new Set<unknown>();
  let current = error;
  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && current.code === "23505") return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

export async function reportPayment(
  db: Database,
  principal: { env: ApiEnvironment; merchantId: string },
  paymentId: string,
  evidence: PaymentReportEvidence,
  buyer: ValidatedBuyerIdentity,
  verifier: TestTransferVerifier = verifyTestTransfer,
) {
  // Test settlement is REAL: verify the Base Sepolia transfer before taking
  // any row lock. A retryable verdict is returned without persisting
  // evidence, so a bad hash can never dead-end the payment.
  let verdict: TestTransferVerdict | undefined;
  if (principal.env === "test") {
    if (!TX_HASH.test(evidence.transactionId)) {
      throw new PaymentVerificationFailedError("The transaction id is not a transaction hash.");
    }
    const preview = await loadReportablePayment(db, principal, paymentId);
    if (preview?.status === "pending") {
      verdict = await verifier({
        amountAtomic: usdcAtomicAmount(preview.amountUsd),
        payerAddress: buyer.payerAddress,
        receiver: preview.receiver,
        tokenAddress: preview.tokenAddress,
        transactionId: evidence.transactionId,
      });
      if (verdict.outcome === "invalid") throw new PaymentVerificationFailedError(verdict.reason);
      if (verdict.outcome === "retryable") {
        return {
          reportedTransactionId: evidence.transactionId,
          status: "pending" as const,
          verificationMethod: null,
          verifiedAt: null,
          webhookDeliveryId: null,
        };
      }
    }
  }

  try {
    return await db.transaction(async (transaction) => {
      const [payment] = await transaction
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.id, paymentId),
            eq(payments.merchantId, principal.merchantId),
            eq(payments.env, principal.env),
          ),
        )
        .for("update");
      if (!payment) throw new PaymentNotFoundError();
      if (payment.status === "failed") throw new PaymentReportConflictError();

      const hasReport = payment.reportedTransactionId !== null;
      if (hasReport && !samePaymentReportEvidence(payment, evidence, buyer)) {
        throw new PaymentReportConflictError();
      }

      const [existingSettlement] = await transaction
        .select()
        .from(settlements)
        .where(eq(settlements.paymentId, payment.id))
        .limit(1);
      if (payment.status === "settled") {
        if (!existingSettlement) throw new PaymentReportStateError();
        return {
          reportedTransactionId: payment.reportedTransactionId,
          status: "settled" as const,
          tokenChanges: existingSettlement.tokenChangesJson,
          verificationMethod: existingSettlement.verificationMethod,
          verifiedAt: existingSettlement.verifiedAt,
          webhookDeliveryId: await findPaymentWebhookDeliveryId(transaction, existingSettlement.id),
        };
      }

      const reportValues = {
        payerAddress: buyer.payerAddress,
        payerEmail: buyer.payerEmail,
        reportedAt: sql`clock_timestamp()`,
        reportedTokenChanges: evidence.tokenChanges,
        reportedTransactionId: evidence.transactionId,
      };
      if (payment.env === "live") {
        if (!hasReport)
          await transaction.update(payments).set(reportValues).where(eq(payments.id, payment.id));
        return {
          reportedTransactionId: evidence.transactionId,
          status: "pending" as const,
          verificationMethod: null,
          verifiedAt: null,
          webhookDeliveryId: null,
        };
      }

      const [settledPayment] = await transaction
        .update(payments)
        .set({
          ...(hasReport ? {} : reportValues),
          settledAt: sql`clock_timestamp()`,
          status: "settled",
        })
        .where(eq(payments.id, payment.id))
        .returning();
      if (!settledPayment?.settledAt) throw new PaymentReportStateError();

      // The pre-lock verdict must exist and be verified for a fresh test
      // settlement; a settled replay returns earlier and never reaches here.
      if (verdict?.outcome !== "verified") throw new PaymentReportStateError();
      const amountAtomic = usdcAtomicAmount(settledPayment.amountUsd);
      const [settlement] = await transaction
        .insert(settlements)
        .values({
          amountAtomic,
          livemode: false,
          particleTransactionId: evidence.transactionId,
          paymentId: payment.id,
          tokenChangesJson: verdict.tokenChanges,
          txHash: verdict.txHash,
          verificationMethod: "rpc",
          verificationTrigger: "inline",
          verifiedAt: settledPayment.settledAt,
        })
        .returning();
      if (!settlement) throw new PaymentReportStateError();
      const webhookDeliveryId = await enqueuePaymentSettledWebhook(
        transaction,
        settledPayment,
        settlement,
      );

      return {
        reportedTransactionId: evidence.transactionId,
        status: "settled" as const,
        tokenChanges: settlement.tokenChangesJson,
        verificationMethod: settlement.verificationMethod,
        verifiedAt: settlement.verifiedAt,
        webhookDeliveryId,
      };
    });
  } catch (error) {
    if (uniqueConstraint(error)) throw new PaymentReportConflictError();
    throw error;
  }
}

async function loadReportablePayment(
  db: Database,
  principal: { env: ApiEnvironment; merchantId: string },
  paymentId: string,
) {
  const [payment] = await db
    .select({
      amountUsd: payments.amountUsd,
      receiver: payments.receiver,
      status: payments.status,
      tokenAddress: payments.tokenAddress,
    })
    .from(payments)
    .where(
      and(
        eq(payments.id, paymentId),
        eq(payments.merchantId, principal.merchantId),
        eq(payments.env, principal.env),
      ),
    )
    .limit(1);
  return payment;
}
