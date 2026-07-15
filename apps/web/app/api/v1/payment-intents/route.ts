import { type NextRequest, NextResponse } from "next/server";

import { requireApiKeyPermission } from "../../../../lib/auth/api-key";
import { apiError, apiKeyError, NO_STORE_HEADERS } from "../../../../lib/auth/api-key-http";
import { authenticateSecretKey } from "../../../../lib/auth/sk-auth";
import { getServerDatabase } from "../../../../lib/db/server";
import {
  InvalidPaymentIntentRequestError,
  mintPaymentIntent,
} from "../../../../lib/payments/mint-payment-intent";
import { PaymentIntentConfigurationError } from "../../../../lib/payments/payment-intent-token";

export async function POST(request: NextRequest) {
  try {
    const database = getServerDatabase().db;
    const principal = await authenticateSecretKey(database, request.headers.get("authorization"));
    requireApiKeyPermission(principal.permissions, "manage");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(
        "INVALID_PAYMENT_INTENT_REQUEST",
        "The payment intent request is invalid.",
        400,
      );
    }

    const result = await mintPaymentIntent(database, principal, body);
    return NextResponse.json(result, { headers: NO_STORE_HEADERS, status: 201 });
  } catch (error) {
    if (error instanceof InvalidPaymentIntentRequestError) {
      return apiError(error.code, error.message, 400);
    }
    if (error instanceof PaymentIntentConfigurationError) {
      return apiError(
        "PAYMENT_INTENT_SIGNING_UNAVAILABLE",
        "Payment intent signing is temporarily unavailable.",
        503,
      );
    }
    return apiKeyError(error);
  }
}
