import { type NextRequest, NextResponse } from "next/server";

import { requireApiKeyPermission } from "../../../../lib/auth/api-key";
import { apiError, apiKeyError, NO_STORE_HEADERS } from "../../../../lib/auth/api-key-http";
import { authenticateSecretKey } from "../../../../lib/auth/sk-auth";
import { getServerDatabase } from "../../../../lib/db/server";
import { paymentResponse } from "../../../../lib/payments/payment-response";
import { listPayments } from "../../../../lib/payments/read-payments";

function requestedLimit(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("limit");
  if (!value) return 20;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export async function GET(request: NextRequest) {
  try {
    const principal = await authenticateSecretKey(
      getServerDatabase().db,
      request.headers.get("authorization"),
    );
    requireApiKeyPermission(principal.permissions, "read");

    const requestedEnv = request.nextUrl.searchParams.get("env");
    if (requestedEnv && requestedEnv !== "test" && requestedEnv !== "live") {
      return apiError("INVALID_ENVIRONMENT", "Environment must be test or live.", 400);
    }
    if (requestedEnv && requestedEnv !== principal.env) {
      return apiError(
        "API_KEY_ENVIRONMENT_DENIED",
        "The API key cannot access that environment.",
        403,
      );
    }

    const limit = requestedLimit(request);
    if (!limit) return apiError("INVALID_LIMIT", "Limit must be a positive integer.", 400);

    const rows = await listPayments(getServerDatabase().db, principal, { limit });
    return NextResponse.json(
      { payments: rows.map(paymentResponse) },
      { headers: NO_STORE_HEADERS, status: 200 },
    );
  } catch (error) {
    return apiKeyError(error);
  }
}
