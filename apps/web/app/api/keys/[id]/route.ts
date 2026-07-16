import { type NextRequest, NextResponse } from "next/server";

import { revokeSecretApiKey } from "../../../../lib/dashboard/api-keys";
import {
  authenticatedMerchant,
  KEY_RESPONSE_HEADERS,
  keyError,
  lifecycleError,
  requestedKeyEnvironment,
  requireAllowedOrigin,
  validUuid,
} from "../../../../lib/dashboard/api-keys-http";
import { getServerDatabase } from "../../../../lib/db/server";

interface KeyRouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: NextRequest, context: KeyRouteContext) {
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

  try {
    await revokeSecretApiKey(getServerDatabase().db, {
      env,
      keyId: id,
      merchantId: principal.merchantId,
    });
  } catch (error) {
    return lifecycleError(error);
  }

  return NextResponse.json({ revoked: true }, { headers: KEY_RESPONSE_HEADERS, status: 200 });
}
