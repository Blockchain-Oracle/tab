import { and, eq, sql } from "drizzle-orm";

import type { ApiEnvironment } from "../auth/api-key";
import type { Database } from "../db/client";
import { payments, settlements } from "../db/schema";

type VerificationTrigger = "cron_sweep" | "inline";

export interface PaymentReportEvidence {
  tokenChanges: unknown[];
  transactionId: string;
}

export interface ValidatedBuyerIdentity {
  payerAddress: string;
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

class PaymentReportStateError extends Error {
  constructor() {
    super("Payment report state is inconsistent");
    this.name = "PaymentReportStateError";
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameAddress(left: string | null, right: string) {
  return left?.toLowerCase() === right.toLowerCase();
}

function sameEvidence(
  payment: typeof payments.$inferSelect,
  evidence: PaymentReportEvidence,
  buyer: ValidatedBuyerIdentity,
) {
  return (
    payment.reportedTransactionId === evidence.transactionId &&
    canonicalJson(payment.reportedTokenChanges) === canonicalJson(evidence.tokenChanges) &&
    sameAddress(payment.payerAddress, buyer.payerAddress)
  );
}

function usdcAtomic(amountUsd: string) {
  const [whole, fraction = ""] = amountUsd.split(".");
  return `${whole}${fraction.padEnd(6, "0")}`.replace(/^0+(?=\d)/, "");
}

function simulatedTokenChanges(payment: typeof payments.$inferSelect, amountAtomic: string) {
  return [
    {
      amountAtomic,
      chainId: payment.tokenChainId,
      receiver: payment.receiver,
      simulation: "simulated_test",
      tokenAddress: payment.tokenAddress,
    },
  ];
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
  trigger: VerificationTrigger,
) {
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
      if (hasReport && !sameEvidence(payment, evidence, buyer)) {
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
          verificationMethod: existingSettlement.verificationMethod,
          verifiedAt: existingSettlement.verifiedAt,
        };
      }

      const reportValues = {
        payerAddress: buyer.payerAddress,
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

      const amountAtomic = usdcAtomic(settledPayment.amountUsd);
      const [settlement] = await transaction
        .insert(settlements)
        .values({
          amountAtomic,
          livemode: false,
          particleTransactionId: evidence.transactionId,
          paymentId: payment.id,
          tokenChangesJson: simulatedTokenChanges(settledPayment, amountAtomic),
          verificationMethod: "simulated_test",
          verificationTrigger: trigger,
          verifiedAt: settledPayment.settledAt,
        })
        .returning();
      if (!settlement) throw new PaymentReportStateError();

      return {
        reportedTransactionId: evidence.transactionId,
        status: "settled" as const,
        verificationMethod: settlement.verificationMethod,
        verifiedAt: settlement.verifiedAt,
      };
    });
  } catch (error) {
    if (uniqueConstraint(error)) throw new PaymentReportConflictError();
    throw error;
  }
}
