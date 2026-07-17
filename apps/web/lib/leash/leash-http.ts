import { type NextRequest, NextResponse } from "next/server";

import { authenticateOwnerRequest } from "../auth/owner-request";
import { requestOriginIsAllowed } from "../auth/request-origin";
import { LeashAgentNotFoundError, LeashCapNotFoundError } from "./cap-policy";

export const LEASH_RESPONSE_HEADERS = { "cache-control": "no-store" };

export function leashError(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message } },
    { headers: LEASH_RESPONSE_HEADERS, status },
  );
}

export function requireLeashMutationOrigin(request: NextRequest) {
  return requestOriginIsAllowed(request)
    ? undefined
    : leashError("ORIGIN_NOT_ALLOWED", "Request origin is not allowed.", 403);
}

export async function requireOwnerRequest(request: NextRequest) {
  const owner = await authenticateOwnerRequest(request);
  return owner ?? leashError("SESSION_REQUIRED", "A valid owner session is required.", 401);
}

export function capPolicyError(error: unknown) {
  if (error instanceof LeashAgentNotFoundError) {
    return leashError("LEASH_AGENT_NOT_FOUND", "The Leash agent was not found.", 404);
  }
  if (error instanceof LeashCapNotFoundError) {
    return leashError("LEASH_CAP_NOT_SET", "Set a cap before resetting its cycle.", 409);
  }
  throw error;
}
