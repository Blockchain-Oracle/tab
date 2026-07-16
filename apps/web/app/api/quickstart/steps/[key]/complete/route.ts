import { type NextRequest, NextResponse } from "next/server";

import { authenticateMerchantRequest } from "../../../../../../lib/auth/merchant-request";
import { requestOriginIsAllowed } from "../../../../../../lib/auth/request-origin";
import {
  completeQuickstartStep,
  isQuickstartStepKey,
  QuickstartStepNotManualError,
} from "../../../../../../lib/dashboard/quickstart";
import { getServerDatabase } from "../../../../../../lib/db/server";

type RouteContext = { params: Promise<{ key: string }> };

function error(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message } },
    { headers: { "cache-control": "no-store" }, status },
  );
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!requestOriginIsAllowed(request)) {
    return error("ORIGIN_NOT_ALLOWED", "Request origin is not allowed.", 403);
  }
  const principal = await authenticateMerchantRequest(request);
  if (!principal) return error("SESSION_REQUIRED", "A valid merchant session is required.", 401);

  const { key } = await context.params;
  if (!isQuickstartStepKey(key)) {
    return error("INVALID_QUICKSTART_STEP", "Quickstart step is not recognized.", 400);
  }

  try {
    const step = await completeQuickstartStep(getServerDatabase().db, principal.merchantId, key);
    return NextResponse.json(
      { step: { doneAt: step.doneAt.toISOString(), key: step.stepKey } },
      { headers: { "cache-control": "no-store" }, status: 200 },
    );
  } catch (routeError) {
    if (routeError instanceof QuickstartStepNotManualError) {
      return error(routeError.code, routeError.message, 409);
    }
    throw routeError;
  }
}
