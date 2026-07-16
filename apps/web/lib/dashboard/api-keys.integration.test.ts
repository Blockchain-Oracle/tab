import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { hashApiKey } from "../auth/api-key";
import { createDatabase } from "../db/client";
import { provisionMerchant } from "../db/provision-merchant";
import { apiKeys } from "../db/schema";
import {
  ApiKeyNotFoundError,
  createSecretApiKey,
  listApiKeys,
  revokeSecretApiKey,
  rotateSecretApiKey,
} from "./api-keys";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for API key integration tests");
}

const connection = createDatabase(databaseUrl, 1);

async function merchant(email: string) {
  return provisionMerchant(connection.db, {
    email,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x1111111111111111111111111111111111111111",
  });
}

describe("merchant API key lifecycle with real PostgreSQL", () => {
  beforeEach(async () => {
    await connection.client`
      truncate table quickstart_progress, api_keys, merchants, users cascade
    `;
  });

  afterAll(async () => {
    await connection.client.end();
  });

  it("starts without secret keys and lists only the requested tenant environment", async () => {
    const first = await merchant("first-keys@example.test");
    const second = await merchant("second-keys@example.test");

    await createSecretApiKey(connection.db, {
      env: "test",
      merchantId: second.merchantId,
      name: "Second tenant key",
      permissions: "full",
    });

    const testRows = await listApiKeys(connection.db, {
      env: "test",
      merchantId: first.merchantId,
    });
    const liveRows = await listApiKeys(connection.db, {
      env: "live",
      merchantId: first.merchantId,
    });

    expect(testRows).toHaveLength(1);
    expect(testRows[0]).toMatchObject({ env: "test", type: "publishable" });
    expect(liveRows).toHaveLength(1);
    expect(liveRows[0]).toMatchObject({ env: "live", type: "publishable" });
    expect([...testRows, ...liveRows].some((row) => row.type === "secret")).toBe(false);
  });

  it.each([
    "full",
    "read_only",
  ] as const)("creates a %s secret with one-time raw material and only its SHA-256 hash at rest", async (permissions) => {
    const identity = await merchant(`${permissions}@example.test`);
    const created = await createSecretApiKey(connection.db, {
      env: "test",
      merchantId: identity.merchantId,
      name: "  Server deploy  ",
      permissions,
    });

    expect(created.secret).toMatch(/^sk_test_[A-Za-z0-9_-]{40,}$/);
    expect(created.key).toMatchObject({
      env: "test",
      name: "Server deploy",
      permissions,
      type: "secret",
    });

    const [stored] = await connection.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, created.key.id));

    expect(stored).toMatchObject({
      last4: created.secret.slice(-4),
      prefix: "sk_test_",
      publicKey: null,
      secretHash: hashApiKey(created.secret),
    });
    expect(JSON.stringify(stored)).not.toContain(created.secret);

    const listed = await listApiKeys(connection.db, {
      env: "test",
      merchantId: identity.merchantId,
    });
    expect(JSON.stringify(listed)).not.toContain(created.secret);
  });

  it("atomically revokes an active key and creates its rotated successor", async () => {
    const identity = await merchant("rotate@example.test");
    const original = await createSecretApiKey(connection.db, {
      env: "test",
      merchantId: identity.merchantId,
      name: "Automation",
      permissions: "read_only",
    });

    const rotated = await rotateSecretApiKey(connection.db, {
      env: "test",
      keyId: original.key.id,
      merchantId: identity.merchantId,
    });

    expect(rotated.secret).not.toBe(original.secret);
    expect(rotated.key).toMatchObject({
      name: "Automation",
      permissions: "read_only",
      rotatedFromId: original.key.id,
    });

    const stored = await connection.db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.merchantId, identity.merchantId), eq(apiKeys.type, "secret")));
    const oldRow = stored.find((row) => row.id === original.key.id);
    const newRow = stored.find((row) => row.id === rotated.key.id);

    expect(oldRow?.revokedAt).toBeInstanceOf(Date);
    expect(newRow).toMatchObject({
      lastUsedAt: null,
      revokedAt: null,
      rotatedFromId: original.key.id,
      secretHash: hashApiKey(rotated.secret),
    });
    await expect(
      rotateSecretApiKey(connection.db, {
        env: "test",
        keyId: original.key.id,
        merchantId: identity.merchantId,
      }),
    ).rejects.toBeInstanceOf(ApiKeyNotFoundError);
  });

  it("revokes instead of deleting history and refuses cross-scope key ids", async () => {
    const first = await merchant("revoke-first@example.test");
    const second = await merchant("revoke-second@example.test");
    const created = await createSecretApiKey(connection.db, {
      env: "live",
      merchantId: first.merchantId,
      name: "Live server",
      permissions: "full",
    });

    await expect(
      revokeSecretApiKey(connection.db, {
        env: "live",
        keyId: created.key.id,
        merchantId: second.merchantId,
      }),
    ).rejects.toBeInstanceOf(ApiKeyNotFoundError);
    await expect(
      revokeSecretApiKey(connection.db, {
        env: "test",
        keyId: created.key.id,
        merchantId: first.merchantId,
      }),
    ).rejects.toBeInstanceOf(ApiKeyNotFoundError);

    await revokeSecretApiKey(connection.db, {
      env: "live",
      keyId: created.key.id,
      merchantId: first.merchantId,
    });

    const [stored] = await connection.db
      .select({ revokedAt: apiKeys.revokedAt })
      .from(apiKeys)
      .where(eq(apiKeys.id, created.key.id));
    expect(stored?.revokedAt).toBeInstanceOf(Date);
  });
});
