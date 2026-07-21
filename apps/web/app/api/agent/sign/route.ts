import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { hashTypedData } from "viem";

import { apiError, NO_STORE_HEADERS } from "../../../../lib/auth/api-key-http";
import { authenticateLeashKey, InvalidLeashKeyError } from "../../../../lib/auth/leash-key";
import { getServerDatabase } from "../../../../lib/db/server";
import {
  readAuthorizationUsed,
  type readFinalizedAuthorizationUsed,
} from "../../../../lib/leash/authorization-state";
import { reconcileExpiredPendingReceipts } from "../../../../lib/leash/expired-payment-reconciliation-store";
import { readFloatBalance } from "../../../../lib/leash/float-balance";
import {
  createMagicExpressClient,
  isMagicExpressConfigured,
  MagicExpressError,
} from "../../../../lib/leash/magic-express";
import type { SignGateCode } from "../../../../lib/leash/sign-gate";
import { InvalidSignRequestError } from "../../../../lib/leash/sign-request";
import {
  completePreSigningChecks,
  failSignRequestBeforeSigning,
  reserveSignRequest,
  SignGateError,
} from "../../../../lib/leash/sign-store";
import {
  claimSigningLease,
  completeSigningLease,
  failSigningLease,
} from "../../../../lib/leash/signing-lease";
import { readSignRequestBody, SignRequestBodyError } from "./sign-request-body";

type MagicSigner = Pick<ReturnType<typeof createMagicExpressClient>, "signTypedData">;
type SignerTypedData = Parameters<MagicSigner["signTypedData"]>[0]["typedData"];

interface SignRouteDependencies {
  authorizationUsed?: typeof readAuthorizationUsed;
  bodyReadTimeoutMs?: number;
  finalizedAuthorizationUsed?: typeof readFinalizedAuthorizationUsed;
  floatBalance?: typeof readFloatBalance;
  reserveRequest?: typeof reserveSignRequest;
  signer?: MagicSigner;
  signerConfigured?: () => boolean;
}

function statusForCode(code: string) {
  if (code === "INVALID_AGENT_KEY") return 401;
  if (code.startsWith("AGENT_")) return 423;
  if (code === "FLOAT_EMPTY") return 402;
  if (code === "CAP_EXCEEDED" || code === "CAP_NOT_SET") return 403;
  if (code === "SIGN_RATE_LIMITED" || code === "SIGNER_PROVIDER_RATE_LIMITED") return 429;
  if (code === "SIGN_REQUEST_IN_PROGRESS" || code === "SIGN_REQUEST_RECONCILING") return 409;
  if (
    code === "SIGNER_PROVIDER_REJECTED" ||
    code === "SIGNER_PROVIDER_INVALID_RESPONSE" ||
    code === "SIGNER_IDENTITY_MISMATCH"
  ) {
    return 502;
  }
  if (
    code === "SIGNER_NOT_CONFIGURED" ||
    code === "FLOAT_CHECK_UNAVAILABLE" ||
    code === "SIGNER_PROVIDER_UNAVAILABLE" ||
    code === "SIGNER_PROVIDER_TIMEOUT"
  ) {
    return 503;
  }
  return 409;
}

function signError(code: string, status = statusForCode(code), retryAfter?: number) {
  const response = apiError(code, "The signing request cannot proceed.", status);
  if (retryAfter) response.headers.set("retry-after", String(retryAfter));
  return response;
}

function success(receiptId: string, signature: `0x${string}`) {
  return NextResponse.json({ receiptId, signature }, { headers: NO_STORE_HEADERS });
}

const TERMINAL_PROVIDER_FAILURES = new Set<SignGateCode>([
  "SIGNER_IDENTITY_MISMATCH",
  "SIGNER_NOT_CONFIGURED",
  "SIGNER_PROVIDER_INVALID_RESPONSE",
  "SIGNER_PROVIDER_REJECTED",
]);

export function createSignPost(dependencies: SignRouteDependencies = {}) {
  const floatBalance = dependencies.floatBalance ?? readFloatBalance;
  const authorizationUsed = dependencies.authorizationUsed ?? readAuthorizationUsed;
  const reserveRequest = dependencies.reserveRequest ?? reserveSignRequest;
  const signer = dependencies.signer ?? createMagicExpressClient();
  const signerConfigured = dependencies.signerConfigured ?? isMagicExpressConfigured;

  return async function POST(request: NextRequest) {
    try {
      const database = getServerDatabase().db;
      const principal = await authenticateLeashKey(database, request.headers.get("authorization"));
      let body: string;
      try {
        body = await readSignRequestBody(request, {
          timeoutMs: dependencies.bodyReadTimeoutMs,
        });
      } catch {
        return signError("INVALID_SIGN_REQUEST", 400);
      }

      await reconcileExpiredPendingReceipts(database, {
        agentId: principal.agentId,
        ...(dependencies.finalizedAuthorizationUsed
          ? { authorizationUsed: dependencies.finalizedAuthorizationUsed }
          : {}),
      });

      const reservation = await reserveRequest(database, {
        agentId: principal.agentId,
        body,
        keyId: principal.leashKeyId,
      });
      if (reservation.kind !== "pending") {
        return signError(reservation.code ?? "SIGN_REQUEST_CONFLICT");
      }

      let liveBalanceAtomic: bigint;
      let floatCheckedAt: Date;
      try {
        liveBalanceAtomic = await floatBalance({
          address: reservation.agentAddress,
          network: reservation.network,
        });
        floatCheckedAt = new Date();
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
        signerAvailable: signerConfigured(),
      });
      if (checked.kind !== "ready") return signError(checked.code ?? "SIGN_REQUEST_CONFLICT");

      const typedData = reservation.signerRequest as unknown as SignerTypedData;
      const digest = hashTypedData(typedData);
      let claim = await claimSigningLease(database, {
        agentId: principal.agentId,
        digest,
        floatCheckedAt,
        keyId: principal.leashKeyId,
        liveBalanceAtomic,
        receiptId: reservation.receiptId,
      });

      if (claim.kind === "reconciliation_required") {
        let used: boolean;
        try {
          used = await authorizationUsed({
            network: reservation.network,
            nonce: reservation.authorizationNonce,
            payer: reservation.agentAddress,
          });
        } catch {
          return signError("SIGN_REQUEST_RECONCILING", 503, 5);
        }
        if (used) return signError("SIGN_REQUEST_RECONCILING", 409, 5);

        try {
          liveBalanceAtomic = await floatBalance({
            address: reservation.agentAddress,
            network: reservation.network,
          });
          floatCheckedAt = new Date();
        } catch {
          return signError("FLOAT_CHECK_UNAVAILABLE", 503, 5);
        }
        const rechecked = await completePreSigningChecks(database, {
          agentId: principal.agentId,
          keyId: principal.leashKeyId,
          liveBalanceAtomic,
          receiptId: reservation.receiptId,
          signerAvailable: signerConfigured(),
        });
        if (rechecked.kind !== "ready") {
          return signError(rechecked.code ?? "SIGN_REQUEST_CONFLICT");
        }
        claim = await claimSigningLease(database, {
          agentId: principal.agentId,
          allowExpiredReclaim: true,
          digest,
          floatCheckedAt,
          keyId: principal.leashKeyId,
          liveBalanceAtomic,
          receiptId: reservation.receiptId,
        });
      }

      if (claim.kind === "signed") return success(claim.receiptId, claim.signature);
      if (claim.kind === "in_progress") {
        return signError("SIGN_REQUEST_IN_PROGRESS", 409, claim.retryAfterSeconds);
      }
      if (claim.kind === "rate_limited") {
        return signError("SIGN_RATE_LIMITED", 429, claim.retryAfterSeconds);
      }
      if (claim.kind === "reconciliation_required") {
        return signError("SIGN_REQUEST_RECONCILING", 409, 5);
      }
      if (claim.kind === "denied") return signError(claim.code);

      let signed: Awaited<ReturnType<MagicSigner["signTypedData"]>>;
      try {
        signed = await signer.signTypedData({
          address: claim.address,
          subject: claim.subject,
          typedData,
        });
        if (signed.digest.toLowerCase() !== claim.digest.toLowerCase()) {
          throw new MagicExpressError("SIGNER_PROVIDER_INVALID_RESPONSE");
        }
      } catch (error) {
        if (!(error instanceof MagicExpressError)) throw error;
        if (TERMINAL_PROVIDER_FAILURES.has(error.code as SignGateCode)) {
          await failSigningLease(database, {
            agentId: principal.agentId,
            claimToken: claim.claimToken,
            code: error.code as SignGateCode,
            receiptId: claim.receiptId,
          });
        }
        const retry = Math.max(1, Math.ceil((claim.leaseExpiresAt.getTime() - Date.now()) / 1_000));
        return signError(error.code, undefined, retry);
      }

      const completed = await completeSigningLease(database, {
        agentId: principal.agentId,
        claimToken: claim.claimToken,
        digest: signed.digest,
        keyId: principal.leashKeyId,
        receiptId: claim.receiptId,
        signature: signed.signature,
      });
      if (completed.kind !== "signed") return signError(completed.code);
      return success(completed.receiptId, completed.signature);
    } catch (error) {
      if (error instanceof InvalidLeashKeyError) {
        return apiError(error.code, error.message, 401);
      }
      if (error instanceof InvalidSignRequestError || error instanceof SignRequestBodyError) {
        return apiError("INVALID_SIGN_REQUEST", "The signing request is invalid.", 400);
      }
      if (error instanceof SignGateError) return signError(error.code, error.status);
      throw error;
    }
  };
}

export const POST = createSignPost();
