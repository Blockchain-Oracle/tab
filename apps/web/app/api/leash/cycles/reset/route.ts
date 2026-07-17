import { type NextRequest, NextResponse } from "next/server";

import { getServerDatabase } from "../../../../../lib/db/server";
import { InvalidCapInputError, parseAgentTarget } from "../../../../../lib/leash/cap-input";
import { resetOwnerCapCycle } from "../../../../../lib/leash/cap-policy";
import {
  capPolicyError,
  LEASH_RESPONSE_HEADERS,
  leashError,
  requireLeashMutationOrigin,
  requireOwnerRequest,
} from "../../../../../lib/leash/leash-http";

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

  let target: ReturnType<typeof parseAgentTarget>;
  try {
    target = parseAgentTarget(body);
  } catch (error) {
    if (error instanceof InvalidCapInputError) {
      return leashError("INVALID_AGENT", "Choose a valid Leash agent.", 400);
    }
    throw error;
  }

  try {
    const policy = await resetOwnerCapCycle(getServerDatabase().db, {
      ...target,
      ownerId: owner.userId,
    });
    return NextResponse.json({ policy }, { headers: LEASH_RESPONSE_HEADERS, status: 200 });
  } catch (error) {
    return capPolicyError(error);
  }
}
