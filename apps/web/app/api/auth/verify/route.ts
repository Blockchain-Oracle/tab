import {
  InvalidMagicIdentityError,
  InvalidMagicTokenError,
  MagicServiceUnavailableError,
  magicAuthenticationConfigured,
  verifyMerchantDidToken,
} from "../../../../lib/auth/magic-admin";
import { magicEmailMatchesRequest } from "../../../../lib/auth/magic-email";
import { requestOriginIsAllowed } from "../../../../lib/auth/request-origin";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  sessionSigningConfigured,
} from "../../../../lib/auth/session";
import { findMerchantIdentity } from "../../../../lib/db/merchant-identity";
import {
  MerchantAlreadyExistsError,
  provisionMerchant,
} from "../../../../lib/db/provision-merchant";
import { getServerDatabase } from "../../../../lib/db/server";
import { jsonError, jsonNoStore } from "../../../../lib/http/responses";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  if (!requestOriginIsAllowed(request)) {
    return jsonError("ORIGIN_NOT_ALLOWED", "Request origin is not allowed.", 403);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    body = undefined;
  }

  const didToken =
    typeof body === "object" &&
    body !== null &&
    "didToken" in body &&
    typeof body.didToken === "string"
      ? body.didToken.trim()
      : "";
  const email =
    typeof body === "object" && body !== null && "email" in body && typeof body.email === "string"
      ? body.email.trim().toLowerCase()
      : "";
  const flow = typeof body === "object" && body !== null && "flow" in body ? body.flow : undefined;

  if (!didToken || !emailPattern.test(email) || (flow !== "signup" && flow !== "login")) {
    return jsonError(
      "INVALID_AUTH_REQUEST",
      "A DID token, email, and valid auth flow are required.",
      400,
    );
  }

  if (!magicAuthenticationConfigured()) {
    return jsonError("MAGIC_NOT_CONFIGURED", "Magic authentication is not configured.", 503);
  }

  if (!sessionSigningConfigured()) {
    return jsonError("SESSION_NOT_CONFIGURED", "Session signing is not configured.", 503);
  }

  let magicIdentity: Awaited<ReturnType<typeof verifyMerchantDidToken>>;

  try {
    magicIdentity = await verifyMerchantDidToken(didToken);
  } catch (authError) {
    if (
      authError instanceof InvalidMagicTokenError ||
      authError instanceof InvalidMagicIdentityError
    ) {
      return jsonError("INVALID_DID_TOKEN", "Magic authentication could not be verified.", 401);
    }
    if (authError instanceof MagicServiceUnavailableError) {
      return jsonError(
        "MAGIC_UNAVAILABLE",
        "Magic authentication is temporarily unavailable.",
        502,
      );
    }
    throw authError;
  }

  if (!magicEmailMatchesRequest(magicIdentity.email, email)) {
    return jsonError(
      "MAGIC_EMAIL_MISMATCH",
      "This browser's saved Magic session belongs to a different email.",
      409,
    );
  }

  const { db } = getServerDatabase();
  let principal: { email: string; merchantId: string; userId: string };
  let redirectTo: string;

  if (flow === "signup") {
    try {
      const provisioned = await provisionMerchant(db, magicIdentity);
      principal = {
        email: magicIdentity.email,
        merchantId: provisioned.merchantId,
        userId: provisioned.userId,
      };
    } catch (provisionError) {
      if (provisionError instanceof MerchantAlreadyExistsError) {
        return jsonError(
          "EMAIL_ALREADY_REGISTERED",
          "An account with this email already exists.",
          409,
        );
      }
      throw provisionError;
    }
    redirectTo = "/dashboard/quickstart";
  } else {
    const identity = await findMerchantIdentity(db, magicIdentity.email, magicIdentity.magicIssuer);

    if (!identity) {
      return jsonError("EMAIL_NOT_REGISTERED", "No account exists for this email.", 404);
    }

    principal = identity;
    redirectTo = "/dashboard/transactions";
  }

  const token = await createSessionToken({ ...principal, mode: "test" });
  const response = jsonNoStore({ redirectTo }, 200);
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());

  return response;
}
