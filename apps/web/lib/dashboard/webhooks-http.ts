import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticateMerchantRequest } from "../auth/merchant-request";
import { requestOriginIsAllowed } from "../auth/request-origin";
import { InvalidWebhookEndpointUrlError } from "../webhooks/endpoint-url";
import { WebhookSecretCryptoError } from "../webhooks/secret-crypto";

export class WebhookDashboardError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "WebhookDashboardError";
  }
}

export function webhookError(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message } },
    { headers: { "cache-control": "no-store" }, status },
  );
}

export async function webhookMerchant(request: NextRequest) {
  const principal = await authenticateMerchantRequest(request);
  return principal
    ? ({ env: principal.mode, merchantId: principal.merchantId } as const)
    : undefined;
}

export async function requireWebhookMerchant(request: NextRequest) {
  const principal = await webhookMerchant(request);
  if (!principal) {
    throw new WebhookDashboardError(
      "SESSION_REQUIRED",
      "A valid merchant session is required.",
      401,
    );
  }
  return principal;
}

export function requireWebhookMutationOrigin(request: NextRequest) {
  if (!requestOriginIsAllowed(request)) {
    throw new WebhookDashboardError("ORIGIN_NOT_ALLOWED", "Request origin is not allowed.", 403);
  }
}

export async function readWebhookUrl(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = undefined;
  }
  const url = typeof body === "object" && body !== null && "url" in body ? body.url : undefined;
  if (typeof url !== "string") {
    throw new WebhookDashboardError("INVALID_WEBHOOK_URL", "Enter a valid HTTPS webhook URL.", 400);
  }
  return url;
}

export function webhookRouteFailure(error: unknown) {
  if (error instanceof WebhookDashboardError) {
    return webhookError(error.code, error.message, error.status);
  }
  if (error instanceof InvalidWebhookEndpointUrlError) {
    return webhookError("INVALID_WEBHOOK_URL", "Enter a valid HTTPS webhook URL.", 400);
  }
  if (error instanceof WebhookSecretCryptoError) {
    return webhookError(
      "WEBHOOK_SECRET_UNAVAILABLE",
      "Webhook secret encryption is not configured.",
      503,
    );
  }
  throw error;
}

export function localWebhookTestOptions() {
  return process.env.NODE_ENV === "test" ? { allowLocalHttp: true } : {};
}
