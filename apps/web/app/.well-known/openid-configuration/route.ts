import { NextResponse } from "next/server";

import { MagicOidcConfigurationError, magicOidcDiscovery } from "../../../lib/leash/magic-oidc";

const PUBLIC_CACHE = { "cache-control": "public, max-age=300" };
const NO_STORE = { "cache-control": "no-store" };

export function GET() {
  try {
    return NextResponse.json(magicOidcDiscovery(), { headers: PUBLIC_CACHE });
  } catch (error) {
    if (!(error instanceof MagicOidcConfigurationError)) throw error;
    return NextResponse.json(
      { error: "OIDC issuer is unavailable." },
      { headers: NO_STORE, status: 503 },
    );
  }
}
