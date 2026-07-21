import { type NextRequest, NextResponse } from "next/server";

import { authenticateMerchantRequest } from "../../../../lib/auth/merchant-request";
import { requestOriginIsAllowed } from "../../../../lib/auth/request-origin";
import { getServerDatabase } from "../../../../lib/db/server";
import { completeDemoOrder, DemoPaymentNotFoundError } from "../../../../lib/demo/complete-order";
import { jsonError } from "../../../../lib/http/responses";

function transactionIdFrom(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "transactionId") return undefined;
  const transactionId = "transactionId" in value ? value.transactionId : undefined;
  return typeof transactionId === "string" ? transactionId : undefined;
}

export async function POST(request: NextRequest) {
  if (!requestOriginIsAllowed(request)) {
    return jsonError("ORIGIN_NOT_ALLOWED", "Request origin is not allowed.", 403);
  }
  const principal = await authenticateMerchantRequest(request);
  if (!principal)
    return jsonError("SESSION_REQUIRED", "A valid merchant session is required.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = undefined;
  }
  const transactionId = transactionIdFrom(body);
  if (!transactionId) {
    return jsonError("INVALID_DEMO_ORDER", "A test transaction ID is required.", 400);
  }

  try {
    const order = await completeDemoOrder(
      getServerDatabase().db,
      principal.merchantId,
      transactionId,
    );
    return NextResponse.json({ order }, { headers: { "cache-control": "no-store" }, status: 201 });
  } catch (routeError) {
    if (routeError instanceof DemoPaymentNotFoundError) {
      return jsonError(routeError.code, routeError.message, 404);
    }
    throw routeError;
  }
}
