import { type NextRequest, NextResponse } from "next/server";

import { LeashAgentNotFoundError } from "../../../../lib/auth/leash-key";
import { getServerDatabase } from "../../../../lib/db/server";
import {
  LEASH_RESPONSE_HEADERS,
  leashError,
  requireLeashMutationOrigin,
  requireOwnerRequest,
} from "../../../../lib/leash/leash-http";
import { InvalidRevokeInputError, parseRevokeRequest } from "../../../../lib/leash/revoke-input";
import {
  InvalidAgentTransitionError,
  InvalidCancelConfirmationError,
  InvalidNuclearConfirmationError,
  revokeOwnerAgent,
} from "../../../../lib/leash/revoke-store";

export async function POST(request: NextRequest) {
  const originError = requireLeashMutationOrigin(request);
  if (originError) return originError;
  const owner = await requireOwnerRequest(request);
  if (owner instanceof Response) return owner;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = undefined;
  }

  let mutation: ReturnType<typeof parseRevokeRequest>;
  try {
    mutation = parseRevokeRequest(body);
  } catch (error) {
    if (error instanceof InvalidRevokeInputError) {
      return leashError("INVALID_REVOKE_INPUT", error.message, 400);
    }
    throw error;
  }

  try {
    const result = await revokeOwnerAgent(getServerDatabase().db, {
      ...mutation,
      actorSurface: "web",
      ownerId: owner.userId,
    });
    return NextResponse.json(result, { headers: LEASH_RESPONSE_HEADERS, status: 200 });
  } catch (error) {
    if (error instanceof LeashAgentNotFoundError) {
      return leashError("AGENT_NOT_FOUND", "The agent was not found.", 404);
    }
    if (error instanceof InvalidAgentTransitionError) {
      return leashError("INVALID_AGENT_TRANSITION", error.message, 409);
    }
    if (error instanceof InvalidNuclearConfirmationError) {
      return leashError("INVALID_NUCLEAR_CONFIRMATION", error.message, 409);
    }
    if (error instanceof InvalidCancelConfirmationError) {
      return leashError("INVALID_REVOKE_INPUT", error.message, 400);
    }
    throw error;
  }
}
