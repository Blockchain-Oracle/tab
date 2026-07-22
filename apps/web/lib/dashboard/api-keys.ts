import { randomBytes } from "node:crypto";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { type ApiEnvironment, type ApiKeyPermissions, hashApiKey } from "../auth/api-key";
import type { Database } from "../db/client";
import { apiKeys } from "../db/schema";

export class ApiKeyNotFoundError extends Error {
  constructor() {
    super("The active secret key was not found.");
    this.name = "ApiKeyNotFoundError";
  }
}

export interface ApiKeyScope {
  env: ApiEnvironment;
  merchantId: string;
}

export interface CreateSecretApiKeyInput extends ApiKeyScope {
  name: string;
  permissions: ApiKeyPermissions;
}

export interface SecretApiKeyTarget extends ApiKeyScope {
  keyId: string;
}

const keySummary = {
  createdAt: apiKeys.createdAt,
  // Full value for PUBLISHABLE keys only (public by design); secret rows
  // store null here — the hash is all we keep.
  publicKey: apiKeys.publicKey,
  env: apiKeys.env,
  id: apiKeys.id,
  last4: apiKeys.last4,
  lastUsedAt: apiKeys.lastUsedAt,
  name: apiKeys.name,
  permissions: apiKeys.permissions,
  prefix: apiKeys.prefix,
  rotatedFromId: apiKeys.rotatedFromId,
  type: apiKeys.type,
};

export type DashboardApiKey = Awaited<ReturnType<typeof listApiKeys>>[number];

function secretMaterial(env: ApiEnvironment) {
  const prefix = `sk_${env}_` as const;
  const secret = `${prefix}${randomBytes(32).toString("base64url")}`;
  return {
    last4: secret.slice(-4),
    prefix,
    secret,
    secretHash: hashApiKey(secret),
  };
}

function activeSecretTarget(input: SecretApiKeyTarget) {
  return and(
    eq(apiKeys.id, input.keyId),
    eq(apiKeys.merchantId, input.merchantId),
    eq(apiKeys.env, input.env),
    eq(apiKeys.type, "secret"),
    isNull(apiKeys.revokedAt),
  );
}

export async function listApiKeys(db: Database, scope: ApiKeyScope) {
  return db
    .select(keySummary)
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.merchantId, scope.merchantId),
        eq(apiKeys.env, scope.env),
        isNull(apiKeys.revokedAt),
      ),
    )
    .orderBy(desc(apiKeys.createdAt), desc(apiKeys.id));
}

export async function createSecretApiKey(db: Database, input: CreateSecretApiKeyInput) {
  const material = secretMaterial(input.env);
  const [key] = await db
    .insert(apiKeys)
    .values({
      env: input.env,
      last4: material.last4,
      merchantId: input.merchantId,
      name: input.name.trim() || "Unnamed key",
      permissions: input.permissions,
      prefix: material.prefix,
      secretHash: material.secretHash,
      type: "secret",
    })
    .returning(keySummary);

  if (!key) throw new Error("PostgreSQL did not return the created API key");
  return { key, secret: material.secret };
}

export async function rotateSecretApiKey(db: Database, input: SecretApiKeyTarget) {
  return db.transaction(async (transaction) => {
    const [previous] = await transaction
      .update(apiKeys)
      .set({ revokedAt: sql`clock_timestamp()` })
      .where(activeSecretTarget(input))
      .returning({ name: apiKeys.name, permissions: apiKeys.permissions });

    if (!previous?.permissions) throw new ApiKeyNotFoundError();

    const material = secretMaterial(input.env);
    const [key] = await transaction
      .insert(apiKeys)
      .values({
        env: input.env,
        last4: material.last4,
        merchantId: input.merchantId,
        name: previous.name,
        permissions: previous.permissions,
        prefix: material.prefix,
        rotatedFromId: input.keyId,
        secretHash: material.secretHash,
        type: "secret",
      })
      .returning(keySummary);

    if (!key) throw new Error("PostgreSQL did not return the rotated API key");
    return { key, secret: material.secret };
  });
}

export async function revokeSecretApiKey(db: Database, input: SecretApiKeyTarget) {
  const [revoked] = await db
    .update(apiKeys)
    .set({ revokedAt: sql`clock_timestamp()` })
    .where(activeSecretTarget(input))
    .returning({ id: apiKeys.id });

  if (!revoked) throw new ApiKeyNotFoundError();
  return revoked;
}
