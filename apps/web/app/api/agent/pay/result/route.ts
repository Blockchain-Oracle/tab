import { type NextRequest, NextResponse } from "next/server";
import { apiError, NO_STORE_HEADERS } from "../../../../../lib/auth/api-key-http";
import { authenticateLeashKey, InvalidLeashKeyError } from "../../../../../lib/auth/leash-key";
import { getServerDatabase } from "../../../../../lib/db/server";
import {
  applySettlementObservation,
  SettlementResultConflictError,
} from "../../../../../lib/leash/pay-result-store";
import {
  InvalidSettlementObservationError,
  parseSettlementObservation,
} from "../../../../../lib/leash/settlement-evidence";

export async function POST(request: NextRequest) {
  try {
    const database = getServerDatabase().db;
    const principal = await authenticateLeashKey(database, request.headers.get("authorization"));
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(
        "INVALID_SETTLEMENT_OBSERVATION",
        "The settlement observation is invalid.",
        400,
      );
    }
    const evidence = parseSettlementObservation(body);
    const result = await applySettlementObservation(database, {
      agentId: principal.agentId,
      evidence,
    });
    if (result.kind === "not_found") {
      return apiError("RECEIPT_NOT_FOUND", "The receipt was not found.", 404);
    }
    if (result.kind === "pending" || result.kind === "settled") {
      return NextResponse.json(
        {
          receiptId: result.receiptId,
          status: result.kind,
          verified: result.verified,
        },
        { headers: NO_STORE_HEADERS, status: result.kind === "settled" ? 200 : 202 },
      );
    }
    return apiError("RECEIPT_NOT_PENDING", "The receipt is not pending.", 409);
  } catch (error) {
    if (error instanceof InvalidLeashKeyError) {
      return apiError(error.code, error.message, 401);
    }
    if (error instanceof InvalidSettlementObservationError) {
      return apiError(error.code, error.message, 400);
    }
    if (error instanceof SettlementResultConflictError) {
      return apiError(error.code, error.message, error.status);
    }
    throw error;
  }
}
