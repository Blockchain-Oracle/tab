import { type NextRequest, NextResponse } from "next/server";

import { requireApiKeyPermission } from "../../../../../lib/auth/api-key";
import { apiError, apiKeyError, NO_STORE_HEADERS } from "../../../../../lib/auth/api-key-http";
import { authenticateSecretKey } from "../../../../../lib/auth/sk-auth";
import { sendDashboardTestWebhook } from "../../../../../lib/dashboard/webhooks-deliveries";
import {
  localWebhookTestOptions,
  WebhookDashboardError,
} from "../../../../../lib/dashboard/webhooks-http";
import { getServerDatabase } from "../../../../../lib/db/server";

/** Send a real signed test delivery to the configured endpoint (secret key auth). */
export async function POST(request: NextRequest) {
  try {
    const database = getServerDatabase().db;
    const principal = await authenticateSecretKey(database, request.headers.get("authorization"));
    requireApiKeyPermission(principal.permissions, "manage");
    const result = await sendDashboardTestWebhook(database, principal, localWebhookTestOptions());
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof WebhookDashboardError) {
      return apiError(error.code, error.message, error.status);
    }
    return apiKeyError(error);
  }
}
