import { type NextRequest, NextResponse } from "next/server";

import { requestOriginIsAllowed } from "../../../lib/auth/request-origin";
import { SESSION_COOKIE_NAME } from "../../../lib/auth/session";
import {
  InactiveMerchantSessionError,
  InvalidMerchantSessionError,
  loadMerchantSession,
} from "../../../lib/auth/session-principal";
import { getServerDatabase } from "../../../lib/db/server";
import { updateMerchantSettings } from "../../../lib/db/update-merchant-settings";
import { jsonError } from "../../../lib/http/responses";
import { normalizeReceivingAddress } from "../../../lib/merchant/receiving-address";

const MAX_BUSINESS_NAME_LENGTH = 100;

async function authenticatedMerchant(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return undefined;

  try {
    return await loadMerchantSession(getServerDatabase().db, token);
  } catch (sessionError) {
    if (
      sessionError instanceof InvalidMerchantSessionError ||
      sessionError instanceof InactiveMerchantSessionError
    ) {
      return undefined;
    }
    throw sessionError;
  }
}

export async function GET(request: NextRequest) {
  const principal = await authenticatedMerchant(request);
  if (!principal) {
    return jsonError("SESSION_REQUIRED", "A valid merchant session is required.", 401);
  }

  return NextResponse.json(
    {
      merchant: {
        businessName: principal.businessName,
        logoEtag: principal.logoEtag,
        logoUrl: principal.logoUrl,
        receivingAddress: principal.receivingAddress,
        receivingAddressSource: principal.receivingAddressSource,
      },
    },
    { headers: { "cache-control": "no-store" }, status: 200 },
  );
}

export async function PATCH(request: NextRequest) {
  if (!requestOriginIsAllowed(request)) {
    return jsonError("ORIGIN_NOT_ALLOWED", "Request origin is not allowed.", 403);
  }

  const principal = await authenticatedMerchant(request);
  if (!principal) {
    return jsonError("SESSION_REQUIRED", "A valid merchant session is required.", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = undefined;
  }

  const businessName =
    typeof body === "object" && body !== null && "businessName" in body
      ? body.businessName
      : undefined;
  if (typeof businessName !== "string" || businessName.trim().length > MAX_BUSINESS_NAME_LENGTH) {
    return jsonError(
      "INVALID_BUSINESS_NAME",
      `Business name must be ${MAX_BUSINESS_NAME_LENGTH} characters or fewer.`,
      400,
    );
  }

  const receivingAddress =
    typeof body === "object" && body !== null && "receivingAddress" in body
      ? body.receivingAddress
      : undefined;
  const normalizedAddress =
    typeof receivingAddress === "string" ? normalizeReceivingAddress(receivingAddress) : undefined;
  if (!normalizedAddress) {
    return jsonError("INVALID_RECEIVING_ADDRESS", "Enter a valid EVM receiving address.", 400);
  }

  const addressChanged =
    normalizedAddress.toLowerCase() !== principal.receivingAddress.toLowerCase();
  const addressConfirmed =
    typeof body === "object" &&
    body !== null &&
    "confirmReceivingAddressChange" in body &&
    body.confirmReceivingAddressChange === true;

  if (addressChanged && !addressConfirmed) {
    return jsonError(
      "RECEIVING_ADDRESS_CONFIRMATION_REQUIRED",
      "Confirm the new receiving address before saving.",
      409,
    );
  }

  const updated = await updateMerchantSettings(getServerDatabase().db, {
    businessName: businessName.trim() || null,
    expectedBusinessName: principal.businessName,
    expectedReceivingAddress: principal.receivingAddress,
    merchantId: principal.merchantId,
    receivingAddress: addressChanged ? normalizedAddress : principal.receivingAddress,
    receivingAddressSource: addressChanged ? "custom" : principal.receivingAddressSource,
  });

  if (!updated) {
    return jsonError(
      "MERCHANT_SETTINGS_CHANGED",
      "Settings changed in another request. Reload the current values before saving again.",
      409,
    );
  }

  return NextResponse.json(
    { merchant: updated },
    { headers: { "cache-control": "no-store" }, status: 200 },
  );
}
