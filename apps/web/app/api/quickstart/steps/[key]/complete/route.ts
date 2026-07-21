import { type NextRequest, NextResponse } from "next/server";

import { authenticateMerchantRequest } from "../../../../../../lib/auth/merchant-request";
import { requestOriginIsAllowed } from "../../../../../../lib/auth/request-origin";
import {
  completeQuickstartStep,
  isQuickstartStepKey,
  QuickstartStepNotManualError,
} from "../../../../../../lib/dashboard/quickstart";
import { getServerDatabase } from "../../../../../../lib/db/server";
import { jsonError } from "../../../../../../lib/http/responses";

type RouteContext = { params: Promise<{ key: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  if (!requestOriginIsAllowed(request)) {
    return jsonError("ORIGIN_NOT_ALLOWED", "Request origin is not allowed.", 403);
  }
  const principal = await authenticateMerchantRequest(request);
  if (!principal)
    return jsonError("SESSION_REQUIRED", "A valid merchant session is required.", 401);

  const { key } = await context.params;
  if (!isQuickstartStepKey(key)) {
    return jsonError("INVALID_QUICKSTART_STEP", "Quickstart step is not recognized.", 400);
  }

  try {
    const step = await completeQuickstartStep(getServerDatabase().db, principal.merchantId, key);
    return NextResponse.json(
      { step: { doneAt: step.doneAt.toISOString(), key: step.stepKey } },
      { headers: { "cache-control": "no-store" }, status: 200 },
    );
  } catch (routeError) {
    if (routeError instanceof QuickstartStepNotManualError) {
      return jsonError(routeError.code, routeError.message, 409);
    }
    throw routeError;
  }
}
