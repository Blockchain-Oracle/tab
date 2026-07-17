import type { NextRequest } from "next/server";
import { apiError } from "../../../../lib/auth/api-key-http";
import { authenticateLeashKey, InvalidLeashKeyError } from "../../../../lib/auth/leash-key";
import { getServerDatabase } from "../../../../lib/db/server";
import { readFloatBalance } from "../../../../lib/leash/float-balance";
import { InvalidSignRequestError } from "../../../../lib/leash/sign-request";
import {
  completePreSigningChecks,
  failSignRequestBeforeSigning,
  reserveSignRequest,
  SignGateError,
} from "../../../../lib/leash/sign-store";

const MAX_SIGN_REQUEST_BYTES = 64 * 1_024;

function statusForCode(code: string) {
  if (code === "INVALID_LEASH_KEY") return 401;
  if (code.startsWith("AGENT_")) return 423;
  if (code === "FLOAT_EMPTY") return 402;
  if (code === "LEASH_CAP_EXCEEDED" || code === "LEASH_CAP_NOT_SET") return 403;
  if (code === "SIGNER_NOT_CONFIGURED" || code === "FLOAT_CHECK_UNAVAILABLE") return 503;
  return 409;
}

function signError(code: string, status = statusForCode(code)) {
  return apiError(code, "The signing request cannot proceed.", status);
}

export async function POST(request: NextRequest) {
  try {
    const database = getServerDatabase().db;
    const principal = await authenticateLeashKey(database, request.headers.get("authorization"));
    const body = await request.text();
    if (Buffer.byteLength(body, "utf8") > MAX_SIGN_REQUEST_BYTES) {
      return signError("INVALID_SIGN_REQUEST", 400);
    }

    const reservation = await reserveSignRequest(database, {
      agentId: principal.agentId,
      body,
      keyId: principal.leashKeyId,
    });
    if (reservation.kind !== "pending") {
      return signError(reservation.code ?? "SIGN_REQUEST_CONFLICT");
    }

    let liveBalanceAtomic: bigint;
    try {
      liveBalanceAtomic = await readFloatBalance({
        address: reservation.agentAddress,
        network: reservation.network,
      });
    } catch {
      await failSignRequestBeforeSigning(database, {
        agentId: principal.agentId,
        reason: "FLOAT_CHECK_UNAVAILABLE",
        receiptId: reservation.receiptId,
      });
      return signError("FLOAT_CHECK_UNAVAILABLE", 503);
    }

    const checked = await completePreSigningChecks(database, {
      agentId: principal.agentId,
      keyId: principal.leashKeyId,
      liveBalanceAtomic,
      receiptId: reservation.receiptId,
      signerAvailable: false,
    });
    if (checked.kind !== "ready") {
      return signError(checked.code ?? "SIGN_REQUEST_CONFLICT");
    }

    return signError("SIGNER_NOT_CONFIGURED", 503);
  } catch (error) {
    if (error instanceof InvalidLeashKeyError) {
      return apiError(error.code, error.message, 401);
    }
    if (error instanceof InvalidSignRequestError) {
      return apiError(error.code, error.message, 400);
    }
    if (error instanceof SignGateError) {
      return signError(error.code, error.status);
    }
    throw error;
  }
}
