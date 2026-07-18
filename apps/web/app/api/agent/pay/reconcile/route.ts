import { type NextRequest, NextResponse } from "next/server";

import { apiError, NO_STORE_HEADERS } from "../../../../../lib/auth/api-key-http";
import { authenticateLeashKey, InvalidLeashKeyError } from "../../../../../lib/auth/leash-key";
import { getServerDatabase } from "../../../../../lib/db/server";
import { reconcileExpiredPaymentReceipt } from "../../../../../lib/leash/expired-payment-reconciliation-store";
import { readSignRequestBody } from "../../sign/sign-request-body";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalidRequest() {
  return apiError(
    "INVALID_PAYMENT_RECONCILIATION",
    "The payment reconciliation request is invalid.",
    400,
  );
}

function parseRequestBody(body: string) {
  let value: unknown;
  try {
    value = JSON.parse(body) as unknown;
  } catch {
    return;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 1 ||
    typeof record.receiptId !== "string" ||
    !UUID.test(record.receiptId)
  ) {
    return;
  }
  return { receiptId: record.receiptId };
}

export async function POST(request: NextRequest) {
  try {
    const database = getServerDatabase().db;
    const principal = await authenticateLeashKey(database, request.headers.get("authorization"));
    let body: string;
    try {
      body = await readSignRequestBody(request);
    } catch {
      return invalidRequest();
    }
    const parsed = parseRequestBody(body);
    if (!parsed) return invalidRequest();

    const result = await reconcileExpiredPaymentReceipt(database, {
      agentId: principal.agentId,
      receiptId: parsed.receiptId,
    });
    if (result.kind === "not_found") {
      return apiError("RECEIPT_NOT_FOUND", "The receipt was not found.", 404);
    }
    if (result.kind === "conflict") {
      return apiError("RECEIPT_NOT_PENDING", "The receipt is not pending.", 409);
    }
    return NextResponse.json(
      {
        receiptId: result.receiptId,
        status: result.kind,
        verified: result.verified,
      },
      { headers: NO_STORE_HEADERS, status: result.kind === "pending" ? 202 : 200 },
    );
  } catch (error) {
    if (error instanceof InvalidLeashKeyError) {
      return apiError(error.code, error.message, 401);
    }
    throw error;
  }
}
