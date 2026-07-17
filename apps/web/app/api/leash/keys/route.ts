import { type NextRequest, NextResponse } from "next/server";

import {
  ActiveLeashKeyExistsError,
  ActiveLeashKeyNotFoundError,
  issueOwnerLeashKey,
  LeashAgentInactiveError,
  LeashAgentNotFoundError,
  readOwnerLeashKey,
  rotateOwnerLeashKey,
} from "../../../../lib/auth/leash-key";
import { getServerDatabase } from "../../../../lib/db/server";
import {
  InvalidLeashKeyInputError,
  parseLeashKeyRotation,
  parseLeashKeyScope,
} from "../../../../lib/leash/key-input";
import {
  LEASH_RESPONSE_HEADERS,
  leashError,
  requireLeashMutationOrigin,
  requireOwnerRequest,
} from "../../../../lib/leash/leash-http";

async function owner(request: NextRequest) {
  const result = await requireOwnerRequest(request);
  return result instanceof Response ? { response: result } : { principal: result };
}

async function requestBody(request: NextRequest) {
  try {
    return (await request.json()) as unknown;
  } catch {
    return undefined;
  }
}

function inputError() {
  return leashError("INVALID_KEY_INPUT", "Choose a valid Leash agent and key.", 400);
}

function lifecycleError(error: unknown) {
  if (error instanceof LeashAgentNotFoundError) {
    return leashError("LEASH_AGENT_NOT_FOUND", "The Leash agent was not found.", 404);
  }
  if (error instanceof LeashAgentInactiveError) {
    return leashError("LEASH_AGENT_INACTIVE", error.message, 409);
  }
  if (error instanceof ActiveLeashKeyNotFoundError) {
    return leashError("LEASH_KEY_NOT_FOUND", "The active Leash key was not found.", 404);
  }
  if (error instanceof ActiveLeashKeyExistsError) {
    return leashError("LEASH_KEY_ALREADY_EXISTS", "Rotate the active Leash key instead.", 409);
  }
  throw error;
}

export async function GET(request: NextRequest) {
  const authenticated = await owner(request);
  if (authenticated.response) return authenticated.response;

  let scope: ReturnType<typeof parseLeashKeyScope>;
  try {
    scope = parseLeashKeyScope({ agentId: request.nextUrl.searchParams.get("agentId") });
  } catch (error) {
    if (error instanceof InvalidLeashKeyInputError) return inputError();
    throw error;
  }

  try {
    const key = await readOwnerLeashKey(getServerDatabase().db, {
      ...scope,
      ownerId: authenticated.principal.userId,
    });
    return NextResponse.json({ key }, { headers: LEASH_RESPONSE_HEADERS, status: 200 });
  } catch (error) {
    return lifecycleError(error);
  }
}

export async function POST(request: NextRequest) {
  const originError = requireLeashMutationOrigin(request);
  if (originError) return originError;
  const authenticated = await owner(request);
  if (authenticated.response) return authenticated.response;

  let scope: ReturnType<typeof parseLeashKeyScope>;
  try {
    scope = parseLeashKeyScope(await requestBody(request));
  } catch (error) {
    if (error instanceof InvalidLeashKeyInputError) return inputError();
    throw error;
  }

  try {
    const created = await issueOwnerLeashKey(getServerDatabase().db, {
      ...scope,
      ownerId: authenticated.principal.userId,
    });
    return NextResponse.json(created, { headers: LEASH_RESPONSE_HEADERS, status: 201 });
  } catch (error) {
    return lifecycleError(error);
  }
}

export async function PATCH(request: NextRequest) {
  const originError = requireLeashMutationOrigin(request);
  if (originError) return originError;
  const authenticated = await owner(request);
  if (authenticated.response) return authenticated.response;

  let target: ReturnType<typeof parseLeashKeyRotation>;
  try {
    target = parseLeashKeyRotation(await requestBody(request));
  } catch (error) {
    if (error instanceof InvalidLeashKeyInputError) return inputError();
    throw error;
  }

  try {
    const replacement = await rotateOwnerLeashKey(getServerDatabase().db, {
      ...target,
      ownerId: authenticated.principal.userId,
    });
    return NextResponse.json(replacement, { headers: LEASH_RESPONSE_HEADERS, status: 200 });
  } catch (error) {
    return lifecycleError(error);
  }
}
