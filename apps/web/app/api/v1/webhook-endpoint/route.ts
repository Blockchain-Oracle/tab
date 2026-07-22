import { type NextRequest, NextResponse } from "next/server";

import { requireApiKeyPermission } from "../../../../lib/auth/api-key";
import { apiError, apiKeyError, NO_STORE_HEADERS } from "../../../../lib/auth/api-key-http";
import { authenticateSecretKey } from "../../../../lib/auth/sk-auth";
import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  readWebhookEndpoint,
  updateWebhookEndpoint,
} from "../../../../lib/dashboard/webhooks-endpoints";
import {
  localWebhookTestOptions,
  WebhookDashboardError,
} from "../../../../lib/dashboard/webhooks-http";
import { getServerDatabase } from "../../../../lib/db/server";

/**
 * Programmatic webhook management with a secret key — the same single
 * endpoint-per-environment model as the dashboard, no session required.
 * POST returns the whsec_ signing secret exactly once.
 */

async function readUrl(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new WebhookDashboardError("INVALID_WEBHOOK_URL", "A webhook url is required.", 400);
  }
  const url = typeof body === "object" && body !== null && "url" in body ? body.url : undefined;
  if (typeof url !== "string" || url.length === 0) {
    throw new WebhookDashboardError("INVALID_WEBHOOK_URL", "A webhook url is required.", 400);
  }
  return url;
}

function failure(error: unknown) {
  if (error instanceof WebhookDashboardError) {
    return apiError(error.code, error.message, error.status);
  }
  return apiKeyError(error);
}

export async function GET(request: NextRequest) {
  try {
    const database = getServerDatabase().db;
    const principal = await authenticateSecretKey(database, request.headers.get("authorization"));
    const endpoint = await readWebhookEndpoint(database, principal);
    return NextResponse.json({ endpoint }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const database = getServerDatabase().db;
    const principal = await authenticateSecretKey(database, request.headers.get("authorization"));
    requireApiKeyPermission(principal.permissions, "manage");
    const url = await readUrl(request);
    const result = await createWebhookEndpoint(database, principal, url, localWebhookTestOptions());
    return NextResponse.json(result, { headers: NO_STORE_HEADERS, status: 201 });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const database = getServerDatabase().db;
    const principal = await authenticateSecretKey(database, request.headers.get("authorization"));
    requireApiKeyPermission(principal.permissions, "manage");
    const url = await readUrl(request);
    const endpoint = await updateWebhookEndpoint(
      database,
      principal,
      url,
      localWebhookTestOptions(),
    );
    return NextResponse.json({ endpoint }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const database = getServerDatabase().db;
    const principal = await authenticateSecretKey(database, request.headers.get("authorization"));
    requireApiKeyPermission(principal.permissions, "manage");
    await deleteWebhookEndpoint(database, principal);
    return new NextResponse(null, { headers: NO_STORE_HEADERS, status: 204 });
  } catch (error) {
    return failure(error);
  }
}
