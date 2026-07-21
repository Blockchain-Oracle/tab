import type { NextRequest } from "next/server";

import {
  completeOnboardingStep,
  isAgentOnboardingStepKey,
  OnboardingEvidenceMissingError,
  OnboardingStepNotManualError,
} from "../../../../../../../lib/agents/onboarding";
import { getServerDatabase } from "../../../../../../../lib/db/server";
import { jsonError, jsonNoStore } from "../../../../../../../lib/http/responses";
import {
  requireLeashMutationOrigin,
  requireOwnerRequest,
} from "../../../../../../../lib/leash/leash-http";

type RouteContext = { params: Promise<{ key: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const originError = requireLeashMutationOrigin(request);
  if (originError) return originError;
  const owner = await requireOwnerRequest(request);
  if (owner instanceof Response) return owner;

  const { key } = await context.params;
  if (!isAgentOnboardingStepKey(key)) {
    return jsonError("INVALID_ONBOARDING_STEP", "Onboarding step is not recognized.", 400);
  }

  let agentId: string | undefined;
  try {
    const body = (await request.json()) as { agentId?: unknown };
    agentId = typeof body.agentId === "string" ? body.agentId : undefined;
  } catch {
    agentId = undefined;
  }

  try {
    const step = await completeOnboardingStep(getServerDatabase().db, {
      ...(agentId ? { agentId } : {}),
      ownerId: owner.userId,
      stepKey: key,
    });
    return jsonNoStore({ step: { doneAt: step.doneAt.toISOString(), key: step.stepKey } });
  } catch (error) {
    if (error instanceof OnboardingStepNotManualError) {
      return jsonError(error.code, error.message, 409);
    }
    if (error instanceof OnboardingEvidenceMissingError) {
      return jsonError(error.code, error.message, 409);
    }
    throw error;
  }
}
