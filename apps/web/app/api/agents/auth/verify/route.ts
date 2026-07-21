import { NextResponse } from "next/server";

import {
  InvalidMagicIdentityError,
  InvalidMagicTokenError,
  MagicServiceUnavailableError,
  magicAuthenticationConfigured,
  verifyOwnerDidToken,
} from "../../../../../lib/auth/magic-admin";
import { magicEmailMatchesRequest } from "../../../../../lib/auth/magic-email";
import { requestOriginIsAllowed } from "../../../../../lib/auth/request-origin";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  sessionSigningConfigured,
} from "../../../../../lib/auth/session";
import {
  findOrCreateOwnerIdentity,
  OwnerIdentityConflictError,
} from "../../../../../lib/db/owner-identity";
import { getServerDatabase } from "../../../../../lib/db/server";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    headers: { "cache-control": "no-store" },
    status,
  });
}

function error(code: string, message: string, status: number) {
  return json({ error: { code, message } }, status);
}

function authInput(body: unknown) {
  if (typeof body !== "object" || body === null) return undefined;
  const didToken =
    "didToken" in body && typeof body.didToken === "string" ? body.didToken.trim() : "";
  const email =
    "email" in body && typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  return didToken && emailPattern.test(email) ? { didToken, email } : undefined;
}

export async function POST(request: Request) {
  if (!requestOriginIsAllowed(request)) {
    return error("ORIGIN_NOT_ALLOWED", "Request origin is not allowed.", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = undefined;
  }

  const input = authInput(body);
  if (!input) {
    return error("INVALID_AUTH_REQUEST", "A DID token and valid email are required.", 400);
  }
  if (!magicAuthenticationConfigured()) {
    return error("MAGIC_NOT_CONFIGURED", "Magic authentication is not configured.", 503);
  }
  if (!sessionSigningConfigured()) {
    return error("SESSION_NOT_CONFIGURED", "Session signing is not configured.", 503);
  }

  let identity: Awaited<ReturnType<typeof verifyOwnerDidToken>>;
  try {
    identity = await verifyOwnerDidToken(input.didToken);
  } catch (authError) {
    if (
      authError instanceof InvalidMagicTokenError ||
      authError instanceof InvalidMagicIdentityError
    ) {
      return error("INVALID_DID_TOKEN", "Magic authentication could not be verified.", 401);
    }
    if (authError instanceof MagicServiceUnavailableError) {
      return error("MAGIC_UNAVAILABLE", "Magic authentication is temporarily unavailable.", 502);
    }
    throw authError;
  }

  if (!magicEmailMatchesRequest(identity.email, input.email)) {
    return error(
      "MAGIC_EMAIL_MISMATCH",
      "This browser's saved Magic session belongs to a different email.",
      409,
    );
  }

  let owner: Awaited<ReturnType<typeof findOrCreateOwnerIdentity>>;
  try {
    owner = await findOrCreateOwnerIdentity(getServerDatabase().db, identity);
  } catch (ownerError) {
    if (ownerError instanceof OwnerIdentityConflictError) {
      return error(
        "MAGIC_IDENTITY_CONFLICT",
        "This Magic identity is already bound to a different Tab account.",
        409,
      );
    }
    throw ownerError;
  }

  const token = await createSessionToken(owner);
  const response = json({ redirectTo: "/leash" }, 200);
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  return response;
}
