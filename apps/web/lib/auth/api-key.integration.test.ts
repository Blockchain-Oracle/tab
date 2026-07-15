import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import { provisionMerchant } from "../db/provision-merchant";
import { apiKeys } from "../db/schema";
import {
  ApiKeyPermissionError,
  hashApiKey,
  InvalidApiKeyError,
  requireApiKeyPermission,
} from "./api-key";
import { authenticatePublishableKey } from "./pk-auth";
import { authenticateSecretKey } from "./sk-auth";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for API key integration tests");
}

const connection = createDatabase(databaseUrl, 1);

beforeEach(async () => {
  await connection.client`
    truncate table quickstart_progress, api_keys, merchants, users cascade
  `;
});

afterAll(async () => {
  await connection.client.end();
});

async function merchant(label: string) {
  return provisionMerchant(connection.db, {
    email: `${label}-${randomUUID()}@example.test`,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x1111111111111111111111111111111111111111",
  });
}

async function insertSecretKey(
  merchantId: string,
  rawKey: string,
  options: {
    env?: "live" | "test";
    permissions?: "full" | "read_only";
    revokedAt?: Date;
  } = {},
) {
  const env = options.env ?? "test";
  const [key] = await connection.db
    .insert(apiKeys)
    .values({
      env,
      last4: rawKey.slice(-4),
      merchantId,
      name: "Integration secret key",
      permissions: options.permissions ?? "read_only",
      prefix: `sk_${env}_`,
      revokedAt: options.revokedAt,
      secretHash: hashApiKey(rawKey),
      type: "secret",
    })
    .returning({ id: apiKeys.id });
  if (!key) throw new Error("PostgreSQL did not return the secret key");
  return key;
}

describe("API key database invariants", () => {
  it("rejects key prefixes that disagree with the stored type and environment", async () => {
    const identity = await merchant("api-key-constraint");

    await expect(
      connection.client`
        insert into api_keys (
          merchant_id, name, type, permissions, env, prefix, last4, secret_hash
        ) values (
          ${identity.merchantId}, 'Mismatched key', 'secret', 'full', 'test',
          'sk_live_', 'abcd', ${"a".repeat(64)}
        )
      `,
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects publishable material that disagrees with stored environment metadata", async () => {
    const identity = await merchant("api-key-material-constraint");

    await expect(
      connection.client`
        insert into api_keys (
          merchant_id, name, type, env, prefix, last4, public_key
        ) values (
          ${identity.merchantId}, 'Mismatched material', 'publishable', 'live',
          'pk_live_', 'abcd', 'pk_test_materialabcd'
        )
      `,
    ).rejects.toMatchObject({ code: "23514" });
  });
});

describe("publishable-key authentication with real PostgreSQL", () => {
  it("authenticates only an exact active publishable key", async () => {
    const identity = await merchant("pk-exact");
    const rawKey = identity.publishableKeys.test;

    await expect(authenticatePublishableKey(connection.db, `Bearer ${rawKey}`)).resolves.toEqual({
      apiKeyId: expect.any(String),
      env: "test",
      merchantId: identity.merchantId,
    });
    await expect(
      authenticatePublishableKey(connection.db, `Bearer ${rawKey}x`),
    ).rejects.toBeInstanceOf(InvalidApiKeyError);
  });

  it("uses the same generic error for missing, malformed, and revoked keys", async () => {
    const identity = await merchant("pk-invalid");
    const rawKey = identity.publishableKeys.live;
    await connection.db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.publicKey, rawKey));

    for (const header of [null, rawKey, `Bearer ${rawKey}`]) {
      await expect(authenticatePublishableKey(connection.db, header)).rejects.toMatchObject({
        code: "INVALID_API_KEY",
        message: "The API key is invalid or revoked.",
      });
    }
  });
});

describe("secret-key authentication with real PostgreSQL", () => {
  it("hashes the bearer key, binds its prefix to row environment, and atomically stamps usage", async () => {
    const identity = await merchant("sk-active");
    const rawKey = `sk_live_${randomUUID().replaceAll("-", "")}`;
    const key = await insertSecretKey(identity.merchantId, rawKey, {
      env: "live",
      permissions: "full",
    });

    await expect(authenticateSecretKey(connection.db, `Bearer ${rawKey}`)).resolves.toEqual({
      apiKeyId: key.id,
      env: "live",
      merchantId: identity.merchantId,
      permissions: "full",
    });
    const [stored] = await connection.db
      .select({ lastUsedAt: apiKeys.lastUsedAt })
      .from(apiKeys)
      .where(eq(apiKeys.id, key.id));
    expect(stored?.lastUsedAt).toBeInstanceOf(Date);
  });

  it("rejects visibly test-scoped secret material stored against live metadata", async () => {
    const identity = await merchant("sk-prefix-mismatch");
    const rawKey = `sk_test_${randomUUID().replaceAll("-", "")}`;
    const key = await insertSecretKey(identity.merchantId, rawKey, { env: "live" });

    await expect(authenticateSecretKey(connection.db, `Bearer ${rawKey}`)).rejects.toBeInstanceOf(
      InvalidApiKeyError,
    );
    const [stored] = await connection.db
      .select({ lastUsedAt: apiKeys.lastUsedAt })
      .from(apiKeys)
      .where(eq(apiKeys.id, key.id));
    expect(stored?.lastUsedAt).toBeNull();
  });

  it("rejects revoked keys without stamping usage", async () => {
    const identity = await merchant("sk-revoked");
    const rawKey = `sk_test_${randomUUID().replaceAll("-", "")}`;
    const key = await insertSecretKey(identity.merchantId, rawKey, { revokedAt: new Date() });

    await expect(authenticateSecretKey(connection.db, `Bearer ${rawKey}`)).rejects.toBeInstanceOf(
      InvalidApiKeyError,
    );
    const [stored] = await connection.db
      .select({ lastUsedAt: apiKeys.lastUsedAt })
      .from(apiKeys)
      .where(eq(apiKeys.id, key.id));
    expect(stored?.lastUsedAt).toBeNull();
  });

  it("centralizes read and manage permission enforcement", async () => {
    expect(() => requireApiKeyPermission("read_only", "read")).not.toThrow();
    expect(() => requireApiKeyPermission("read_only", "manage")).toThrow(ApiKeyPermissionError);
    expect(() => requireApiKeyPermission("full", "read")).not.toThrow();
    expect(() => requireApiKeyPermission("full", "manage")).not.toThrow();
  });
});
