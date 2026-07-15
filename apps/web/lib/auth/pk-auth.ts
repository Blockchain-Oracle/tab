import { and, eq, isNull } from "drizzle-orm";

import type { Database } from "../db/client";
import { apiKeys } from "../db/schema";
import { type ApiKeyPrincipal, InvalidApiKeyError, readBearerApiKey } from "./api-key";

export async function authenticatePublishableKey(
  db: Database,
  authorizationHeader: string | null,
): Promise<ApiKeyPrincipal> {
  const rawKey = readBearerApiKey(authorizationHeader);
  const [principal] = await db
    .select({
      apiKeyId: apiKeys.id,
      env: apiKeys.env,
      merchantId: apiKeys.merchantId,
    })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.type, "publishable"),
        eq(apiKeys.publicKey, rawKey),
        isNull(apiKeys.revokedAt),
      ),
    )
    .limit(1);

  if (!principal) {
    throw new InvalidApiKeyError();
  }

  return principal;
}
