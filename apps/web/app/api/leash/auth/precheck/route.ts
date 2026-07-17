import { magicAuthenticationConfigured } from "../../../../../lib/auth/magic-admin";
import { requestOriginIsAllowed } from "../../../../../lib/auth/request-origin";
import { sessionSigningConfigured } from "../../../../../lib/auth/session";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status = 200) {
  return Response.json(body, {
    headers: { "cache-control": "no-store" },
    status,
  });
}

function error(code: string, message: string, status: number) {
  return json({ error: { code, message } }, status);
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

  const email =
    typeof body === "object" && body !== null && "email" in body && typeof body.email === "string"
      ? body.email.trim()
      : "";

  if (!emailPattern.test(email)) {
    return error("INVALID_EMAIL", "Enter a valid email address.", 400);
  }
  if (!magicAuthenticationConfigured()) {
    return error("MAGIC_NOT_CONFIGURED", "Magic authentication is not configured.", 503);
  }
  if (!sessionSigningConfigured()) {
    return error("SESSION_NOT_CONFIGURED", "Session signing is not configured.", 503);
  }
  if (!process.env.DATABASE_URL?.trim()) {
    return error("DATABASE_NOT_CONFIGURED", "Owner storage is not configured.", 503);
  }

  return json({ allowed: true });
}
