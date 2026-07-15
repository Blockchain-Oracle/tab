import type { payments } from "../db/schema";
import type { PaymentReportEvidence, ValidatedBuyerIdentity } from "./payment-report";

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

export function samePaymentReportEvidence(
  payment: typeof payments.$inferSelect,
  evidence: PaymentReportEvidence,
  buyer: ValidatedBuyerIdentity,
) {
  return (
    payment.reportedTransactionId === evidence.transactionId &&
    canonicalJson(payment.reportedTokenChanges) === canonicalJson(evidence.tokenChanges) &&
    payment.payerAddress?.toLowerCase() === buyer.payerAddress.toLowerCase()
  );
}

export function usdcAtomicAmount(amountUsd: string) {
  const [whole, fraction = ""] = amountUsd.split(".");
  return `${whole}${fraction.padEnd(6, "0")}`.replace(/^0+(?=\d)/, "");
}

export function simulatedSettlementTokenChanges(
  payment: typeof payments.$inferSelect,
  amountAtomic: string,
) {
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
