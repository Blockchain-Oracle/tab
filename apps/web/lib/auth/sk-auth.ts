import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";

import type { Database } from "../db/client";
import { apiKeys } from "../db/schema";
import {
  hashApiKey,
  InvalidApiKeyError,
  readBearerApiKey,
  type SecretApiKeyPrincipal,
} from "./api-key";

export async function authenticateSecretKey(
  db: Database,
  authorizationHeader: string | null,
): Promise<SecretApiKeyPrincipal> {
  const presented = readBearerApiKey(authorizationHeader);
  if (presented.type !== "secret") throw new InvalidApiKeyError();
  const secretHash = hashApiKey(presented.rawKey);
  const [principal] = await db
    .update(apiKeys)
    .set({ lastUsedAt: sql`clock_timestamp()` })
    .where(
      and(
        eq(apiKeys.type, "secret"),
        eq(apiKeys.secretHash, secretHash),
        eq(apiKeys.env, presented.env),
        eq(apiKeys.prefix, presented.prefix),
        isNotNull(apiKeys.permissions),
        isNull(apiKeys.revokedAt),
      ),
    )
    .returning({
      apiKeyId: apiKeys.id,
      env: apiKeys.env,
      merchantId: apiKeys.merchantId,
      permissions: apiKeys.permissions,
    });

  if (principal?.permissions !== "full" && principal?.permissions !== "read_only") {
    throw new InvalidApiKeyError();
  }

  return { ...principal, permissions: principal.permissions };
}
