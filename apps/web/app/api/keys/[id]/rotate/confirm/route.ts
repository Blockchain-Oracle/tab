import { type NextRequest, NextResponse } from "next/server";

import { rotateSecretApiKey } from "../../../../../../lib/dashboard/api-keys";
import {
  authenticatedMerchant,
  KEY_RESPONSE_HEADERS,
  keyError,
  lifecycleError,
  requestedKeyEnvironment,
  requireAllowedOrigin,
  validUuid,
} from "../../../../../../lib/dashboard/api-keys-http";
import { getServerDatabase } from "../../../../../../lib/db/server";

interface KeyRouteContext {
  params: Promise<{ id: string }>;
}

async function confirmed(request: NextRequest) {
  try {
    const body = (await request.json()) as unknown;
    return (
      typeof body === "object" &&
      body !== null &&
      !Array.isArray(body) &&
      Object.keys(body).length === 1 &&
      "confirm" in body &&
      body.confirm === true
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest, context: KeyRouteContext) {
  const originError = requireAllowedOrigin(request);
  if (originError) return originError;

  const principal = await authenticatedMerchant(request);
  if (!principal) {
    return keyError("SESSION_REQUIRED", "A valid merchant session is required.", 401);
  }
  const env = requestedKeyEnvironment(request, principal.mode);
  if (!env) return keyError("INVALID_ENVIRONMENT", "Environment must be test or live.", 400);

  const { id } = await context.params;
  if (!validUuid(id)) {
    return keyError("INVALID_KEY_ID", "The API key id is invalid.", 400);
  }
  if (!(await confirmed(request))) {
    return keyError(
      "ROTATION_CONFIRMATION_REQUIRED",
      "Confirm key rotation before replacing this secret.",
      409,
    );
  }

  try {
    const rotated = await rotateSecretApiKey(getServerDatabase().db, {
      env,
      keyId: id,
      merchantId: principal.merchantId,
    });
    return NextResponse.json(rotated, { headers: KEY_RESPONSE_HEADERS, status: 201 });
  } catch (error) {
    return lifecycleError(error);
  }
}
