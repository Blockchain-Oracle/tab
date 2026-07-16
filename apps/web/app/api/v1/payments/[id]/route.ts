import { type NextRequest, NextResponse } from "next/server";

import { requireApiKeyPermission } from "../../../../../lib/auth/api-key";
import { apiError, apiKeyError, NO_STORE_HEADERS } from "../../../../../lib/auth/api-key-http";
import {
  InvalidMagicIdentityError,
  InvalidMagicTokenError,
  MagicNotConfiguredError,
  MagicServiceUnavailableError,
  magicAuthenticationConfigured,
  verifyBuyerDidToken,
} from "../../../../../lib/auth/magic-admin";
import { authenticatePublishableKey } from "../../../../../lib/auth/pk-auth";
import { authenticateSecretKey } from "../../../../../lib/auth/sk-auth";
import { getServerDatabase } from "../../../../../lib/db/server";
import {
  PaymentNotFoundError,
  PaymentReportConflictError,
  reportPayment,
} from "../../../../../lib/payments/payment-report";
import { processPaymentReportAfterCommit } from "../../../../../lib/payments/payment-report-post-commit";
import {
  InvalidPaymentReportError,
  MAX_PAYMENT_REPORT_BODY_BYTES,
  parsePaymentReportRequest,
} from "../../../../../lib/payments/payment-report-request";
import { paymentReportResponseBody } from "../../../../../lib/payments/payment-report-response";
import { paymentResponse } from "../../../../../lib/payments/payment-response";
import { retrievePayment } from "../../../../../lib/payments/read-payments";

type RouteContext = { params: Promise<{ id: string }> };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPORT_CORS_HEADERS = {
  "access-control-allow-headers": "Authorization, Content-Type",
  "access-control-allow-methods": "PATCH, OPTIONS",
  "access-control-allow-origin": "*",
  "access-control-max-age": "86400",
};

class PaymentReportBodyTooLargeError extends Error {}

function withReportCors(response: NextResponse) {
  for (const [name, value] of Object.entries(REPORT_CORS_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

function reportError(code: string, message: string, status: number) {
  return withReportCors(apiError(code, message, status));
}

function claimedBodyIsTooLarge(request: NextRequest) {
  const header = request.headers.get("content-length");
  if (!header || !/^\d+$/.test(header)) return false;
  const length = Number(header);
  return !Number.isSafeInteger(length) || length > MAX_PAYMENT_REPORT_BODY_BYTES;
}

async function readReportBody(request: NextRequest) {
  if (claimedBodyIsTooLarge(request)) throw new PaymentReportBodyTooLargeError();
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_PAYMENT_REPORT_BODY_BYTES) {
    throw new PaymentReportBodyTooLargeError();
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new InvalidPaymentReportError();
  }
}

export function OPTIONS() {
  return new NextResponse(null, { headers: REPORT_CORS_HEADERS, status: 204 });
}

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

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const database = getServerDatabase().db;
    const principal = await authenticatePublishableKey(
      database,
      request.headers.get("authorization"),
    );
    const { id } = await context.params;
    if (!UUID_PATTERN.test(id)) {
      return reportError("INVALID_PAYMENT_ID", "Payment ID must be a UUID.", 400);
    }

    const scopedPayment = await retrievePayment(database, principal, id);
    if (!scopedPayment) {
      return reportError("PAYMENT_NOT_FOUND", "Payment was not found.", 404);
    }

    const body = parsePaymentReportRequest(await readReportBody(request));
    if (!magicAuthenticationConfigured()) {
      return reportError("MAGIC_NOT_CONFIGURED", "Magic authentication is not configured.", 503);
    }
    const buyer = await verifyBuyerDidToken(body.buyerDidToken);
    const result = await reportPayment(
      database,
      principal,
      id,
      { tokenChanges: body.tokenChanges, transactionId: body.transactionId },
      { payerAddress: buyer.payerAddress },
    );
    await processPaymentReportAfterCommit(database, id, result);

    return withReportCors(
      NextResponse.json(paymentReportResponseBody(id, result), {
        headers: NO_STORE_HEADERS,
        status: result.status === "settled" ? 200 : 202,
      }),
    );
  } catch (error) {
    if (error instanceof PaymentReportBodyTooLargeError) {
      return reportError("PAYMENT_REPORT_TOO_LARGE", "The payment report is too large.", 413);
    }
    if (error instanceof InvalidPaymentReportError) {
      return reportError(error.code, error.message, 400);
    }
    if (error instanceof InvalidMagicTokenError || error instanceof InvalidMagicIdentityError) {
      return reportError("INVALID_DID_TOKEN", "Magic authentication could not be verified.", 401);
    }
    if (error instanceof MagicNotConfiguredError) {
      return reportError("MAGIC_NOT_CONFIGURED", "Magic authentication is not configured.", 503);
    }
    if (error instanceof MagicServiceUnavailableError) {
      return reportError(
        "MAGIC_UNAVAILABLE",
        "Magic authentication is temporarily unavailable.",
        502,
      );
    }
    if (error instanceof PaymentNotFoundError) {
      return reportError(error.code, error.message, 404);
    }
    if (error instanceof PaymentReportConflictError) {
      return reportError(error.code, error.message, 409);
    }
    return withReportCors(apiKeyError(error));
  }
}
