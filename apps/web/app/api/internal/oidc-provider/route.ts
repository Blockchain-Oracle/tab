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

/** Probe: attempt a diagnostic wallet creation and return Magic's raw
 * status + body so provider-side failures can be read without guessing. */
export async function PUT(request: NextRequest) {
  if (!authorized(request)) return jsonError("UNAUTHORIZED", "Unauthorized.", 401);
  const secret = magicSecret();
  if (!secret) return jsonError("MAGIC_NOT_CONFIGURED", "No Magic secret configured.", 503);

  const { mintMagicAgentJwt } = await import("../../../../lib/leash/magic-oidc");
  const { randomBytes } = await import("node:crypto");
  const subject = `agent_${randomBytes(32).toString("base64url")}`;
  const token = await mintMagicAgentJwt(subject);

  const results: Record<string, unknown> = {};
  for (const path of ["/v2/wallet", "/v1/wallet"]) {
    const response = await fetch(`https://tee.express.magiclabs.com${path}`, {
      body: "{}",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-magic-chain": "ETH",
        "x-magic-secret-key": secret,
        "x-oidc-provider-id": process.env.MAGIC_OIDC_PROVIDER_ID ?? "",
      },
      method: "POST",
    });
    results[path] = { body: (await response.text()).slice(0, 500), status: response.status };
    if (response.ok) break;
  }
  return NextResponse.json(
    { providerId: process.env.MAGIC_OIDC_PROVIDER_ID ?? null, results, subject },
    { headers: { "cache-control": "no-store" } },
  );
}
