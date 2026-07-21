import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { requestOriginIsAllowed } from "../../../../lib/auth/request-origin";
import {
  createSessionToken,
  InvalidSessionTokenError,
  isMerchantSession,
  readSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "../../../../lib/auth/session";
import { merchants, users } from "../../../../lib/db/schema";
import { getServerDatabase } from "../../../../lib/db/server";
import { jsonError } from "../../../../lib/http/responses";

/**
 * One identity, two privilege scopes. Both dashboards share the same signed
 * session cookie; the scope is a token claim. Switching re-mints the token
 * with the other scope from the session we already trust — no second OTP.
 * Route guards stay strict: merchant routes still reject owner tokens and
 * vice versa.
 */
export async function POST(request: NextRequest) {
  if (!requestOriginIsAllowed(request)) {
    return jsonError("ORIGIN_NOT_ALLOWED", "Request origin is not allowed.", 403);
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);
  if (!token) {
    return jsonError("SESSION_REQUIRED", "Sign in before switching workspaces.", 401);
  }

  let session: Awaited<ReturnType<typeof readSessionToken>>;
  try {
    session = await readSessionToken(token);
  } catch (error) {
    if (error instanceof InvalidSessionTokenError) {
      return jsonError("SESSION_REQUIRED", "Sign in before switching workspaces.", 401);
    }
    throw error;
  }

  const { db } = getServerDatabase();

  // The user row must still exist and match the signed claims.
  const [user] = await db
    .select({ email: users.email, id: users.id })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!user || user.email !== session.email) {
    return jsonError("SESSION_REQUIRED", "Sign in before switching workspaces.", 401);
  }

  if (isMerchantSession(session)) {
    // Merchant → agent owner: drop the merchant scope.
    const nextToken = await createSessionToken({ email: user.email, userId: user.id });
    const response = NextResponse.json(
      { redirectTo: "/agents" },
      { headers: { "cache-control": "no-store" }, status: 200 },
    );
    response.cookies.set(SESSION_COOKIE_NAME, nextToken, sessionCookieOptions());
    return response;
  }

  // Agent owner → merchant: the user must own a merchant workspace.
  const [merchant] = await db
    .select({ id: merchants.id })
    .from(merchants)
    .where(eq(merchants.userId, user.id))
    .limit(1);
  if (!merchant) {
    return jsonError(
      "NO_MERCHANT_WORKSPACE",
      "No merchant workspace exists for this account yet. Create one from the signup page.",
      409,
    );
  }

  // Always re-enter on Testnet; Mainnet stays an explicit dashboard action.
  const nextToken = await createSessionToken({
    email: user.email,
    merchantId: merchant.id,
    mode: "test",
    userId: user.id,
  });
  const response = NextResponse.json(
    { redirectTo: "/dashboard" },
    { headers: { "cache-control": "no-store" }, status: 200 },
  );
  response.cookies.set(SESSION_COOKIE_NAME, nextToken, sessionCookieOptions());
  return response;
}
