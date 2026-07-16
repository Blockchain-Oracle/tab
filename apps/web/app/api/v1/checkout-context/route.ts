import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { apiError, apiKeyError, NO_STORE_HEADERS } from "../../../../lib/auth/api-key-http";
import { authenticatePublishableKey } from "../../../../lib/auth/pk-auth";
import { merchants } from "../../../../lib/db/schema";
import { getServerDatabase } from "../../../../lib/db/server";

const CHECKOUT_CONTEXT_CORS_HEADERS = {
  "access-control-allow-headers": "Authorization, Content-Type",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-origin": "*",
  "access-control-max-age": "86400",
};

function withCors(response: NextResponse) {
  for (const [name, value] of Object.entries(CHECKOUT_CONTEXT_CORS_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

function publicClientConfig() {
  const magicPublishableKey = process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY?.trim();
  const projectId = process.env.PARTICLE_PROJECT_ID?.trim();
  const projectClientKey = process.env.PARTICLE_CLIENT_KEY?.trim();
  const projectAppUuid = process.env.PARTICLE_APP_ID?.trim();
  if (!magicPublishableKey || !projectId || !projectClientKey || !projectAppUuid) return undefined;
  return {
    magicPublishableKey,
    particle: { projectAppUuid, projectClientKey, projectId },
  };
}

export function OPTIONS() {
  return new NextResponse(null, { headers: CHECKOUT_CONTEXT_CORS_HEADERS, status: 204 });
}

export async function GET(request: NextRequest) {
  try {
    const database = getServerDatabase().db;
    const principal = await authenticatePublishableKey(
      database,
      request.headers.get("authorization"),
    );
    const clientConfig = publicClientConfig();
    if (!clientConfig) {
      return withCors(
        apiError("CHECKOUT_CONFIGURATION_UNAVAILABLE", "Checkout is temporarily unavailable.", 503),
      );
    }

    const [merchant] = await database
      .select({ businessName: merchants.businessName, logoUrl: merchants.logoUrl })
      .from(merchants)
      .where(eq(merchants.id, principal.merchantId))
      .limit(1);
    if (!merchant) return withCors(apiError("INVALID_API_KEY", "The API key is invalid.", 401));

    return withCors(
      NextResponse.json(
        {
          capabilities: { livePaymentExecution: false },
          clientConfig,
          merchant,
          mode: principal.env,
        },
        { headers: NO_STORE_HEADERS, status: 200 },
      ),
    );
  } catch (error) {
    return withCors(apiKeyError(error));
  }
}
