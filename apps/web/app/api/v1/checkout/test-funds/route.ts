import { type NextRequest, NextResponse } from "next/server";

import { apiError, apiKeyError, NO_STORE_HEADERS } from "../../../../../lib/auth/api-key-http";
import {
  magicAuthenticationConfigured,
  verifyBuyerDidToken,
} from "../../../../../lib/auth/magic-admin";
import { authenticatePublishableKey } from "../../../../../lib/auth/pk-auth";
import { getServerDatabase } from "../../../../../lib/db/server";
import {
  CheckoutFaucetAddressError,
  claimCheckoutTestFunds,
} from "../../../../../lib/faucet/checkout-grant";
import { FaucetUnavailableError } from "../../../../../lib/faucet/claim-grant";
import { RateLimitedError } from "../../../../../lib/http/rate-limit";

export const maxDuration = 60;

const CORS_HEADERS = {
  "access-control-allow-headers": "Authorization, Content-Type",
  "access-control-allow-methods": "OPTIONS, POST",
  "access-control-allow-origin": "*",
  "access-control-max-age": "86400",
};

function withCors(response: NextResponse) {
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS, status: 204 });
}

function clientIp(request: NextRequest) {
  // x-real-ip is set by the hosting proxy; raw x-forwarded-for is
  // client-editable, so it is only a best-effort fallback (the session/
  // recipient-bound limits are the real guarantees).
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local"
  );
}

/**
 * In-flow buyer funding for test-mode checkout: real Base Sepolia
 * transfers to the buyer's address, so an empty wallet can finish the
 * test checkout without leaving. Live keys are refused outright.
 */
export async function POST(request: NextRequest) {
  try {
    const database = getServerDatabase().db;
    const principal = await authenticatePublishableKey(
      database,
      request.headers.get("authorization"),
    );
    if (principal.env !== "test") {
      return withCors(
        apiError("LIVE_MODE_NO_TEST_FUNDS", "Test funds are never granted on Mainnet.", 403),
      );
    }

    let buyerDidToken: string | undefined;
    try {
      const body = (await request.json()) as { buyerDidToken?: unknown };
      buyerDidToken = typeof body.buyerDidToken === "string" ? body.buyerDidToken : undefined;
    } catch {
      buyerDidToken = undefined;
    }
    if (!buyerDidToken) {
      return withCors(
        apiError("INVALID_TEST_FUNDS_REQUEST", "A buyer identity token is required.", 400),
      );
    }
    if (!magicAuthenticationConfigured()) {
      return withCors(
        apiError("TEST_FUNDS_UNAVAILABLE", "Buyer verification is unavailable.", 503),
      );
    }
    // The grant goes to the VERIFIED buyer's own address — a scraped
    // publishable key alone cannot direct test funds anywhere else.
    const buyer = await verifyBuyerDidToken(buyerDidToken);

    const report = await claimCheckoutTestFunds(database, {
      address: buyer.payerAddress,
      clientIp: clientIp(request),
      merchantId: principal.merchantId,
    });
    return withCors(NextResponse.json({ grant: report }, { headers: NO_STORE_HEADERS }));
  } catch (error) {
    if (error instanceof CheckoutFaucetAddressError) {
      return withCors(apiError("INVALID_TEST_FUNDS_REQUEST", error.message, 400));
    }
    if (error instanceof RateLimitedError) {
      const response = apiError(
        "TEST_FUNDS_RATE_LIMITED",
        "Test funds were granted recently. Try again later.",
        429,
      );
      response.headers.set("retry-after", String(error.retryAfterSeconds));
      return withCors(response);
    }
    if (error instanceof FaucetUnavailableError) {
      return withCors(apiError("TEST_FUNDS_UNAVAILABLE", error.message, 503));
    }
    return withCors(apiKeyError(error));
  }
}
