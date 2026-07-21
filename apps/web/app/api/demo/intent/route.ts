import { type NextRequest, NextResponse } from "next/server";

import { authenticateMerchantRequest } from "../../../../lib/auth/merchant-request";
import { getServerDatabase } from "../../../../lib/db/server";
import { DEMO_TEST_AMOUNT_USD } from "../../../../lib/demo/config";
import { jsonError } from "../../../../lib/http/responses";
import { mintPaymentIntent } from "../../../../lib/payments/mint-payment-intent";
import { PaymentIntentConfigurationError } from "../../../../lib/payments/payment-intent-token";

export async function GET(request: NextRequest) {
  const principal = await authenticateMerchantRequest(request);
  if (!principal)
    return jsonError("SESSION_REQUIRED", "A valid merchant session is required.", 401);

  try {
    const result = await mintPaymentIntent(
      getServerDatabase().db,
      {
        apiKeyId: "dashboard-demo-session",
        env: "test",
        merchantId: principal.merchantId,
        permissions: "full",
      },
      {
        amount: DEMO_TEST_AMOUNT_USD,
        intentUrl: request.nextUrl.origin + request.nextUrl.pathname,
      },
    );
    return NextResponse.json(result, {
      headers: { "cache-control": "no-store" },
      status: 200,
    });
  } catch (routeError) {
    if (routeError instanceof PaymentIntentConfigurationError) {
      return jsonError(
        "PAYMENT_INTENT_SIGNING_UNAVAILABLE",
        "Payment intent signing is temporarily unavailable.",
        503,
      );
    }
    throw routeError;
  }
}
