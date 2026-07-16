import { type NextRequest, NextResponse } from "next/server";

import type { ApiEnvironment } from "../auth/api-key";
import { authenticateMerchantRequest } from "../auth/merchant-request";
import { requestOriginIsAllowed } from "../auth/request-origin";
import { ApiKeyNotFoundError } from "./api-keys";

export const KEY_RESPONSE_HEADERS = { "cache-control": "no-store" };

export function keyError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { headers: KEY_RESPONSE_HEADERS, status });
}

export async function authenticatedMerchant(request: NextRequest) {
  return authenticateMerchantRequest(request);
}

export function requireAllowedOrigin(request: NextRequest) {
  return requestOriginIsAllowed(request)
    ? undefined
    : keyError("ORIGIN_NOT_ALLOWED", "Request origin is not allowed.", 403);
}

export function lifecycleError(error: unknown) {
  if (error instanceof ApiKeyNotFoundError) {
    return keyError("KEY_NOT_FOUND", error.message, 404);
  }
  throw error;
}

export function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function requestedKeyEnvironment(request: NextRequest, fallback: ApiEnvironment) {
  const value = request.nextUrl.searchParams.get("env");
  if (value === null) return fallback;
  return value === "live" || value === "test" ? value : undefined;
}
