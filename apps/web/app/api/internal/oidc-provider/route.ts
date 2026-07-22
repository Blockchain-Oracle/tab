import { type NextRequest, NextResponse } from "next/server";

import { jsonError } from "../../../../lib/http/responses";

/**
 * Internal operator surface: manage the Magic Express OIDC provider
 * registration using THIS deployment's Magic secret — the secret never
 * leaves the server. Guarded by INTERNAL_ADMIN_TOKEN.
 */

const MAGIC_PROVIDER_URL = "https://tee.express.magiclabs.com/v1/identity/provider";

function authorized(request: NextRequest) {
  const token = process.env.INTERNAL_ADMIN_TOKEN?.trim();
  if (!token) return false;
  return request.headers.get("authorization") === `Bearer ${token}`;
}

function magicSecret() {
  return (
    process.env.MAGIC_TEE_SECRET_KEY?.trim() || process.env.MAGIC_SECRET_KEY?.trim() || undefined
  );
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return jsonError("UNAUTHORIZED", "Unauthorized.", 401);
  const secret = magicSecret();
  if (!secret) return jsonError("MAGIC_NOT_CONFIGURED", "No Magic secret configured.", 503);
  const response = await fetch(MAGIC_PROVIDER_URL, {
    headers: { "x-magic-secret-key": secret },
  });
  return NextResponse.json(
    { providers: await response.json(), status: response.status },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return jsonError("UNAUTHORIZED", "Unauthorized.", 401);
  const secret = magicSecret();
  if (!secret) return jsonError("MAGIC_NOT_CONFIGURED", "No Magic secret configured.", 503);
  const response = await fetch(MAGIC_PROVIDER_URL, {
    body: JSON.stringify({
      audience: process.env.MAGIC_OIDC_AUDIENCE,
      issuer: process.env.MAGIC_OIDC_ISSUER,
      jwks_uri: `${process.env.MAGIC_OIDC_ISSUER}/.well-known/jwks.json`,
    }),
    headers: { "content-type": "application/json", "x-magic-secret-key": secret },
    method: "POST",
  });
  return NextResponse.json(
    { registration: await response.json(), status: response.status },
    { headers: { "cache-control": "no-store" } },
  );
}
