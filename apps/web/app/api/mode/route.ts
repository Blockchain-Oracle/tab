import { type NextRequest, NextResponse } from "next/server";

import { requestOriginIsAllowed } from "../../../lib/auth/request-origin";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "../../../lib/auth/session";
import {
  InactiveMerchantSessionError,
  InvalidMerchantSessionError,
  loadMerchantSession,
} from "../../../lib/auth/session-principal";
import { getServerDatabase } from "../../../lib/db/server";
import { jsonError } from "../../../lib/http/responses";

export async function POST(request: NextRequest) {
  if (!requestOriginIsAllowed(request)) {
    return jsonError("ORIGIN_NOT_ALLOWED", "Request origin is not allowed.", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = undefined;
  }

  const mode = typeof body === "object" && body !== null && "mode" in body ? body.mode : undefined;
  if (mode !== "test" && mode !== "live") {
    return jsonError("INVALID_MODE", "Choose test or live mode.", 400);
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return jsonError("SESSION_REQUIRED", "A merchant session is required.", 401);
  }

  let principal: Awaited<ReturnType<typeof loadMerchantSession>>;
  try {
    principal = await loadMerchantSession(getServerDatabase().db, token);
  } catch (sessionError) {
    if (
      sessionError instanceof InvalidMerchantSessionError ||
      sessionError instanceof InactiveMerchantSessionError
    ) {
      return jsonError("SESSION_REQUIRED", "A valid merchant session is required.", 401);
    }
    throw sessionError;
  }

  if (mode === "live" && !principal.liveActivatedAt) {
    return jsonError(
      "LIVE_NOT_ACTIVATED",
      "Complete Go Live setup before selecting live mode.",
      409,
    );
  }

  const nextToken = await createSessionToken({
    email: principal.email,
    merchantId: principal.merchantId,
    mode,
    userId: principal.userId,
  });
  const response = NextResponse.json(
    { mode },
    { headers: { "cache-control": "no-store" }, status: 200 },
  );
  response.cookies.set(SESSION_COOKIE_NAME, nextToken, sessionCookieOptions());
  return response;
}
