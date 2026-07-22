import { type NextRequest, NextResponse } from "next/server";

import { apiError, apiKeyError, NO_STORE_HEADERS } from "../../../../../lib/auth/api-key-http";
import { authenticatePublishableKey } from "../../../../../lib/auth/pk-auth";
import { getServerDatabase } from "../../../../../lib/db/server";
import {
  InvalidPaymentIntentRequestError,
  mintPaymentIntent,
} from "../../../../../lib/payments/mint-payment-intent";
import { PaymentIntentConfigurationError } from "../../../../../lib/payments/payment-intent-token";

/**
 * Playground rail: mint a small, Testnet-only intent with just a
 * publishable key. This is what makes try.runtab.xyz work with zero
 * secrets — a pk is public by design, the env is sandbox, and the amount
 * is capped, so the worst anyone can do is pay a merchant sandbox USDC.
 */

const CORS_HEADERS = {
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-origin": "*",
  ...NO_STORE_HEADERS,
};

const PLAYGROUND_AMOUNTS = new Set(["0.50", "1.00", "2.00", "5.00"]);

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS, status: 204 });
}

export async function GET(request: NextRequest) {
  try {
    const database = getServerDatabase().db;
    // Key arrives as a query param so a playground link is one URL — the
    // publishable key is public by design.
    const pk = request.nextUrl.searchParams.get("pk")?.trim();
    const principal = await authenticatePublishableKey(
      database,
      pk ? `Bearer ${pk}` : request.headers.get("authorization"),
    );
    if (principal.env !== "test") {
      return withCors(
        apiError(
          "PLAYGROUND_TESTNET_ONLY",
          "The playground mints Testnet intents only. Mainnet unlocks after live verification.",
          403,
        ),
      );
    }
    const amount = request.nextUrl.searchParams.get("amount") ?? "1.00";
    if (!PLAYGROUND_AMOUNTS.has(amount)) {
      return withCors(
        apiError("INVALID_PLAYGROUND_AMOUNT", "Choose 0.50, 1.00, 2.00, or 5.00.", 400),
      );
    }

    const result = await mintPaymentIntent(
      database,
      { ...principal, permissions: "full" },
      { amount, intentUrl: request.url },
    );
    return NextResponse.json(result, { headers: CORS_HEADERS, status: 200 });
  } catch (error) {
    if (error instanceof InvalidPaymentIntentRequestError) {
      return withCors(apiError(error.code, error.message, 400));
    }
    if (error instanceof PaymentIntentConfigurationError) {
      return withCors(
        apiError(
          "PAYMENT_INTENT_SIGNING_UNAVAILABLE",
          "Payment intent signing is temporarily unavailable.",
          503,
        ),
      );
    }
    return withCors(apiKeyError(error));
  }
}

function withCors(response: NextResponse) {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}
