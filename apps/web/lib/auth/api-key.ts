import { createHash } from "node:crypto";

export type ApiEnvironment = "live" | "test";
export type ApiKeyCapability = "manage" | "read";
export type ApiKeyPermissions = "full" | "read_only";

export interface ApiKeyPrincipal {
  apiKeyId: string;
  env: ApiEnvironment;
  merchantId: string;
}

export interface SecretApiKeyPrincipal extends ApiKeyPrincipal {
  permissions: ApiKeyPermissions;
}

export class InvalidApiKeyError extends Error {
  readonly code = "INVALID_API_KEY";

  constructor() {
    super("The API key is invalid or revoked.");
    this.name = "InvalidApiKeyError";
  }
}

export class ApiKeyPermissionError extends Error {
  readonly code = "API_KEY_PERMISSION_DENIED";

  constructor() {
    super("The API key does not permit this operation.");
    this.name = "ApiKeyPermissionError";
  }
}

export function readBearerApiKey(authorizationHeader: string | null) {
  const match = authorizationHeader?.match(/^Bearer ([A-Za-z0-9_-]{1,256})$/i);
  const key = match?.[1];

  if (!key) {
    throw new InvalidApiKeyError();
  }

  return key;
}

export function hashApiKey(rawKey: string) {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

export function requireApiKeyPermission(
  permissions: ApiKeyPermissions,
  capability: ApiKeyCapability,
) {
  if (capability === "manage" && permissions !== "full") {
    throw new ApiKeyPermissionError();
  }
}
