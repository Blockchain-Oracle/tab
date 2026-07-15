import { NextResponse } from "next/server";

import { ApiKeyPermissionError, InvalidApiKeyError } from "./api-key";

export const NO_STORE_HEADERS = { "cache-control": "no-store" };

export function apiError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { headers: NO_STORE_HEADERS, status });
}

export function apiKeyError(error: unknown) {
  if (error instanceof InvalidApiKeyError) {
    return apiError(error.code, error.message, 401);
  }
  if (error instanceof ApiKeyPermissionError) {
    return apiError(error.code, error.message, 403);
  }
  throw error;
}
