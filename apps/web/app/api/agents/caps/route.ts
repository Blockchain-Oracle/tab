import { type NextRequest, NextResponse } from "next/server";

import { getServerDatabase } from "../../../../lib/db/server";
import {
  InvalidCapInputError,
  parseAgentTarget,
  parseCapMutation,
} from "../../../../lib/leash/cap-input";
import { readOwnerCap, setOwnerCap } from "../../../../lib/leash/cap-policy";
import { readOwnerCapResetNotice } from "../../../../lib/leash/cap-reset-notice";
import {
  capPolicyError,
  LEASH_RESPONSE_HEADERS,
  leashError,
  requireLeashMutationOrigin,
  requireOwnerRequest,
} from "../../../../lib/leash/leash-http";

async function owner(request: NextRequest) {
  const result = await requireOwnerRequest(request);
  return result instanceof Response ? { response: result } : { principal: result };
}

export async function GET(request: NextRequest) {
  const authenticated = await owner(request);
  if (authenticated.response) return authenticated.response;

  let target: ReturnType<typeof parseAgentTarget>;
  try {
    target = parseAgentTarget({ agentId: request.nextUrl.searchParams.get("agentId") });
  } catch (error) {
    if (error instanceof InvalidCapInputError) {
      return leashError("INVALID_AGENT", "Choose a valid agent.", 400);
    }
    throw error;
  }

  try {
    const database = getServerDatabase().db;
    const scope = {
      ...target,
      ownerId: authenticated.principal.userId,
    };
    const [policy, resetNotice] = await Promise.all([
      readOwnerCap(database, scope),
      readOwnerCapResetNotice(database, scope),
    ]);
    return NextResponse.json(
      { policy, resetNotice },
      { headers: LEASH_RESPONSE_HEADERS, status: 200 },
    );
  } catch (error) {
    return capPolicyError(error);
  }
}

async function mutate(request: NextRequest, status: 200 | 201) {
  const originError = requireLeashMutationOrigin(request);
  if (originError) return originError;
  const authenticated = await owner(request);
  if (authenticated.response) return authenticated.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = undefined;
  }

  let mutation: ReturnType<typeof parseCapMutation>;
  try {
    mutation = parseCapMutation(body);
  } catch (error) {
    if (error instanceof InvalidCapInputError) {
      return leashError(error.code, error.message, 400);
    }
    throw error;
  }

  try {
    const database = getServerDatabase().db;
    const scope = {
      ...mutation,
      ownerId: authenticated.principal.userId,
    };
    const policy = await setOwnerCap(database, scope);
    const resetNotice = await readOwnerCapResetNotice(database, scope);
    return NextResponse.json({ policy, resetNotice }, { headers: LEASH_RESPONSE_HEADERS, status });
  } catch (error) {
    return capPolicyError(error);
  }
}

export function POST(request: NextRequest) {
  return mutate(request, 201);
}

export function PATCH(request: NextRequest) {
  return mutate(request, 200);
}
