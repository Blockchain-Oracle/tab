import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

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

/**
 * Silent workspace entry for top-level navigation. One identity carries both
 * scopes; landing on a surface with the OTHER scope's token must re-mint the
 * cookie and continue — never dump a signed-in user at a login screen.
 * Guards redirect here when they see a token with the wrong scope; anyone
 * without a usable session still ends at the login page for the surface.
 */

const DESTINATIONS = {
  merchant: { home: "/dashboard", login: "/login" },
  owner: { home: "/agents", login: "/agents/login" },
} as const;

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.url), {
    headers: { "cache-control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const scopeParam = new URL(request.url).searchParams.get("scope");
  const scope = scopeParam === "merchant" || scopeParam === "owner" ? scopeParam : null;
  if (!scope) return redirectTo(request, "/login");
  const destination = DESTINATIONS[scope];

  const token = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);
  if (!token) return redirectTo(request, destination.login);

  let session: Awaited<ReturnType<typeof readSessionToken>>;
  try {
    session = await readSessionToken(token);
  } catch (error) {
    if (error instanceof InvalidSessionTokenError) {
      return redirectTo(request, destination.login);
    }
    throw error;
  }

  const { db } = getServerDatabase();
  const [user] = await db
    .select({ email: users.email, id: users.id })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!user || user.email !== session.email) {
    return redirectTo(request, destination.login);
  }

  if (scope === "owner") {
    // Merchant → owner needs nothing beyond the identity we already trust.
    const response = redirectTo(request, destination.home);
    if (isMerchantSession(session)) {
      const nextToken = await createSessionToken({ email: user.email, userId: user.id });
      response.cookies.set(SESSION_COOKIE_NAME, nextToken, sessionCookieOptions());
    }
    return response;
  }

  if (isMerchantSession(session)) return redirectTo(request, destination.home);

  // Owner → merchant: the user must own a merchant workspace.
  const [merchant] = await db
    .select({ id: merchants.id })
    .from(merchants)
    .where(eq(merchants.userId, user.id))
    .limit(1);
  if (!merchant) return redirectTo(request, destination.login);

  // Always re-enter on Testnet; Mainnet stays an explicit dashboard action.
  const nextToken = await createSessionToken({
    email: user.email,
    merchantId: merchant.id,
    mode: "test",
    userId: user.id,
  });
  const response = redirectTo(request, destination.home);
  response.cookies.set(SESSION_COOKIE_NAME, nextToken, sessionCookieOptions());
  return response;
}
