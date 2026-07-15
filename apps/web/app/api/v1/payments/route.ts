import { type NextRequest, NextResponse } from "next/server";

import { requireApiKeyPermission } from "../../../../lib/auth/api-key";
import { apiError, apiKeyError, NO_STORE_HEADERS } from "../../../../lib/auth/api-key-http";
import { authenticatePublishableKey } from "../../../../lib/auth/pk-auth";
import { authenticateSecretKey } from "../../../../lib/auth/sk-auth";
import { getServerDatabase } from "../../../../lib/db/server";
import {
  createPayment,
  InvalidCreatePaymentRequestError,
  PaymentCreationUnavailableError,
  PaymentIntentConflictError,
  StalePaymentIntentError,
} from "../../../../lib/payments/create-payment";
import {
  InvalidPaymentIntentTokenError,
  PaymentIntentConfigurationError,
} from "../../../../lib/payments/payment-intent-token";
import { paymentResponse } from "../../../../lib/payments/payment-response";
import { listPayments } from "../../../../lib/payments/read-payments";

const CHECKOUT_CORS_HEADERS = {
  "access-control-allow-headers": "Authorization, Content-Type",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-origin": "*",
  "access-control-max-age": "86400",
};
const MAX_CREATE_PAYMENT_BODY_BYTES = 10_000;

function withCheckoutCors(response: NextResponse) {
  for (const [name, value] of Object.entries(CHECKOUT_CORS_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

function checkoutError(code: string, message: string, status: number) {
  return withCheckoutCors(apiError(code, message, status));
}

function claimedBodyIsTooLarge(request: NextRequest) {
  const header = request.headers.get("content-length");
  if (!header || !/^\d+$/.test(header)) return false;
  const length = Number(header);
  return !Number.isSafeInteger(length) || length > MAX_CREATE_PAYMENT_BODY_BYTES;
}

export function OPTIONS() {
  return new NextResponse(null, { headers: CHECKOUT_CORS_HEADERS, status: 204 });
}

export async function POST(request: NextRequest) {
  try {
    const database = getServerDatabase().db;
    const principal = await authenticatePublishableKey(
      database,
      request.headers.get("authorization"),
    );

    if (claimedBodyIsTooLarge(request)) {
      return checkoutError("PAYMENT_REQUEST_TOO_LARGE", "The payment request is too large.", 413);
    }

    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_CREATE_PAYMENT_BODY_BYTES) {
      return checkoutError("PAYMENT_REQUEST_TOO_LARGE", "The payment request is too large.", 413);
    }

    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      return checkoutError(
        "INVALID_PAYMENT_INTENT_TOKEN",
        "The payment intent token is invalid or expired.",
        400,
      );
    }

    const result = await createPayment(database, principal, body);
    const payment = result.payment;
    return NextResponse.json(
      {
        payment: {
          amount: payment.amountUsd,
          currency: payment.currency,
          env: payment.env,
          livemode: payment.livemode,
          receiver: payment.receiver,
          status: payment.status,
          token: { address: payment.tokenAddress, chainId: payment.tokenChainId },
        },
        paymentId: payment.id,
        refCode: payment.refCode,
      },
      {
        headers: { ...NO_STORE_HEADERS, ...CHECKOUT_CORS_HEADERS },
        status: result.created ? 201 : 200,
      },
    );
  } catch (error) {
    if (
      error instanceof InvalidCreatePaymentRequestError ||
      error instanceof InvalidPaymentIntentTokenError
    ) {
      return checkoutError(
        "INVALID_PAYMENT_INTENT_TOKEN",
        "The payment intent token is invalid or expired.",
        400,
      );
    }
    if (error instanceof StalePaymentIntentError || error instanceof PaymentIntentConflictError) {
      return checkoutError(error.code, error.message, 409);
    }
    if (
      error instanceof PaymentIntentConfigurationError ||
      error instanceof PaymentCreationUnavailableError
    ) {
      return checkoutError(
        "PAYMENT_CREATION_UNAVAILABLE",
        "Payment creation is temporarily unavailable.",
        503,
      );
    }
    return withCheckoutCors(apiKeyError(error));
  }
}

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
