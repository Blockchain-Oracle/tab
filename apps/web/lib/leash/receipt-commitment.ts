import { and, eq, gt, isNotNull, ne, or } from "drizzle-orm";

import { receipts } from "../db/schema";

function validEvaluationTime(value: Date) {
  if (!Number.isFinite(value.getTime())) throw new Error("The commitment timestamp is invalid");
  return value;
}

export function revertedReceiptEvidence() {
  return and(
    eq(receipts.status, "failed"),
    isNotNull(receipts.txHash),
    ne(receipts.reason, "AUTHORIZATION_EXPIRED"),
  );
}

export function unsettledReceiptCommitted() {
  return or(eq(receipts.status, "pending"), revertedReceiptEvidence());
}

export function receiptCommitted() {
  return or(eq(receipts.status, "settled"), unsettledReceiptCommitted());
}

export function floatReservationAt(evaluatedAt: Date) {
  const timestamp = validEvaluationTime(evaluatedAt);
  return and(
    or(eq(receipts.status, "pending"), revertedReceiptEvidence()),
    gt(receipts.authorizationValidBefore, timestamp),
  );
}
