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

export interface PresentedApiKey {
  env: ApiEnvironment;
  prefix: "pk_live_" | "pk_test_" | "sk_live_" | "sk_test_";
  rawKey: string;
  type: "publishable" | "secret";
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
  const rawKey = match?.[1];
  const material = rawKey?.match(/^(pk|sk)_(test|live)_([A-Za-z0-9_-]+)$/);

  if (!rawKey || !material) {
    throw new InvalidApiKeyError();
  }

  const env = material[2];
  if (env !== "test" && env !== "live") throw new InvalidApiKeyError();
  const type = material[1] === "pk" ? "publishable" : "secret";
  const prefix = `${material[1]}_${env}_` as PresentedApiKey["prefix"];
  return { env, prefix, rawKey, type } satisfies PresentedApiKey;
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
