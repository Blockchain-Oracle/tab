import { type NextRequest, NextResponse } from "next/server";

import { requireApiKeyPermission } from "../../../../../lib/auth/api-key";
import { apiError, apiKeyError, NO_STORE_HEADERS } from "../../../../../lib/auth/api-key-http";
import { authenticateSecretKey } from "../../../../../lib/auth/sk-auth";
import { getServerDatabase } from "../../../../../lib/db/server";
import { paymentResponse } from "../../../../../lib/payments/payment-response";
import { retrievePayment } from "../../../../../lib/payments/read-payments";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const principal = await authenticateSecretKey(
      getServerDatabase().db,
      request.headers.get("authorization"),
    );
    requireApiKeyPermission(principal.permissions, "read");

    const { id } = await context.params;
    if (!UUID_PATTERN.test(id)) {
      return apiError("INVALID_PAYMENT_ID", "Payment ID must be a UUID.", 400);
    }

    const payment = await retrievePayment(getServerDatabase().db, principal, id);
    if (!payment) return apiError("PAYMENT_NOT_FOUND", "Payment was not found.", 404);

    return NextResponse.json(
      { payment: paymentResponse(payment) },
      { headers: NO_STORE_HEADERS, status: 200 },
    );
  } catch (error) {
    return apiKeyError(error);
  }
}
