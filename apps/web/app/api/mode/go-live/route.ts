import { type NextRequest, NextResponse } from "next/server";

import { authenticateMerchantRequest } from "../../../../lib/auth/merchant-request";
import { requestOriginIsAllowed } from "../../../../lib/auth/request-origin";
import {
  activateLiveMode,
  GoLiveAcknowledgementRequiredError,
  readGoLiveReadiness,
} from "../../../../lib/dashboard/go-live";
import { getServerDatabase } from "../../../../lib/db/server";

function error(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message } },
    { headers: { "cache-control": "no-store" }, status },
  );
}

export async function GET(request: NextRequest) {
  const principal = await authenticateMerchantRequest(request);
  if (!principal) return error("SESSION_REQUIRED", "A valid merchant session is required.", 401);
  const readiness = await readGoLiveReadiness(getServerDatabase().db, principal.merchantId);
  return NextResponse.json(
    { activated: Boolean(principal.liveActivatedAt), readiness },
    { headers: { "cache-control": "no-store" }, status: 200 },
  );
}

export async function POST(request: NextRequest) {
  if (!requestOriginIsAllowed(request)) {
    return error("ORIGIN_NOT_ALLOWED", "Request origin is not allowed.", 403);
  }
  const principal = await authenticateMerchantRequest(request);
  if (!principal) return error("SESSION_REQUIRED", "A valid merchant session is required.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = undefined;
  }
  const acknowledgeIncomplete =
    typeof body === "object" &&
    body !== null &&
    "acknowledgeIncomplete" in body &&
    body.acknowledgeIncomplete === true;

  try {
    const result = await activateLiveMode(getServerDatabase().db, principal.merchantId, {
      acknowledgeIncomplete,
    });
    return NextResponse.json(
      {
        activated: true,
        liveActivatedAt: result.liveActivatedAt.toISOString(),
        readiness: result.readiness,
      },
      { headers: { "cache-control": "no-store" }, status: 200 },
    );
  } catch (routeError) {
    if (routeError instanceof GoLiveAcknowledgementRequiredError) {
      return error(routeError.code, routeError.message, 409);
    }
    throw routeError;
  }
}
