import type { NextRequest } from "next/server";
import { getServerDatabase } from "../../../../lib/db/server";
import {
  claimAgentGrant,
  FaucetAgentError,
  FaucetUnavailableError,
} from "../../../../lib/faucet/claim-grant";
import { RateLimitedError } from "../../../../lib/http/rate-limit";
import { jsonError, jsonNoStore } from "../../../../lib/http/responses";
import {
  leashError,
  requireLeashMutationOrigin,
  requireOwnerRequest,
} from "../../../../lib/leash/leash-http";

export const maxDuration = 60;

function clientIp(request: NextRequest) {
  // x-real-ip is set by the hosting proxy; raw x-forwarded-for is
  // client-editable, so it is only a best-effort fallback (the session/
  // recipient-bound limits are the real guarantees).
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local"
  );
}

export async function POST(request: NextRequest) {
  const originError = requireLeashMutationOrigin(request);
  if (originError) return originError;
  const owner = await requireOwnerRequest(request);
  if (owner instanceof Response) return owner;

  let agentId: string | undefined;
  try {
    const body = (await request.json()) as { agentId?: unknown };
    agentId = typeof body.agentId === "string" ? body.agentId : undefined;
  } catch {
    agentId = undefined;
  }
  if (!agentId) return jsonError("INVALID_FAUCET_REQUEST", "An agentId is required.", 400);

  try {
    const report = await claimAgentGrant(getServerDatabase().db, {
      agentId,
      clientIp: clientIp(request),
      ownerId: owner.userId,
    });
    return jsonNoStore({ grant: report });
  } catch (error) {
    if (error instanceof RateLimitedError) {
      const response = jsonError(
        "FAUCET_RATE_LIMITED",
        "Test funds were granted recently. Try again later.",
        429,
      );
      response.headers.set("retry-after", String(error.retryAfterSeconds));
      return response;
    }
    if (error instanceof FaucetAgentError) {
      return jsonError(error.code, error.message, error.code === "AGENT_NOT_FOUND" ? 404 : 409);
    }
    if (error instanceof FaucetUnavailableError) {
      return jsonError("FAUCET_UNAVAILABLE", error.message, 503);
    }
    console.error("faucet claim failed", error);
    return leashError("FAUCET_FAILED", "The grant could not be processed.", 500);
  }
}
