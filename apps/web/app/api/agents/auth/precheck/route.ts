import { magicAuthenticationConfigured } from "../../../../../lib/auth/magic-admin";
import { requestOriginIsAllowed } from "../../../../../lib/auth/request-origin";
import { sessionSigningConfigured } from "../../../../../lib/auth/session";
import { jsonError, jsonNoStore } from "../../../../../lib/http/responses";

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

  const email =
    typeof body === "object" && body !== null && "email" in body && typeof body.email === "string"
      ? body.email.trim()
      : "";

  if (!emailPattern.test(email)) {
    return jsonError("INVALID_EMAIL", "Enter a valid email address.", 400);
  }
  if (!magicAuthenticationConfigured()) {
    return jsonError("MAGIC_NOT_CONFIGURED", "Magic authentication is not configured.", 503);
  }
  if (!sessionSigningConfigured()) {
    return jsonError("SESSION_NOT_CONFIGURED", "Session signing is not configured.", 503);
  }
  if (!process.env.DATABASE_URL?.trim()) {
    return jsonError("DATABASE_NOT_CONFIGURED", "Owner storage is not configured.", 503);
  }

  return jsonNoStore({ allowed: true });
}
