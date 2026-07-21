import type { NextRequest } from "next/server";

import { authenticateOwnerRequest } from "../auth/owner-request";
import { requestOriginIsAllowed } from "../auth/request-origin";
import { jsonError, NO_STORE_HEADERS } from "../http/responses";
import { LeashAgentNotFoundError, LeashCapNotFoundError } from "./cap-policy";

export const LEASH_RESPONSE_HEADERS = NO_STORE_HEADERS;

export const leashError = jsonError;

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
    return leashError("AGENT_NOT_FOUND", "The agent was not found.", 404);
  }
  if (error instanceof LeashCapNotFoundError) {
    return leashError("CAP_NOT_SET", "Set a cap before resetting its cycle.", 409);
  }
  throw error;
}
