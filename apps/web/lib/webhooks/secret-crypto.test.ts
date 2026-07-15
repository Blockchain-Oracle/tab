import { randomBytes, randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createWebhookSecret,
  decryptWebhookSecret,
  encryptWebhookSecret,
  parseWebhookEncryptionKey,
  resolveWebhookEncryptionKey,
} from "./secret-crypto";

const context = {
  endpointId: "11111111-1111-4111-8111-111111111111",
  env: "test" as const,
  keyVersion: 1,
  merchantId: "22222222-2222-4222-8222-222222222222",
};

describe("webhook secret encryption", () => {
  it("round-trips AES-256-GCM without placing plaintext in the envelope", () => {
    const key = randomBytes(32);
    const secret = createWebhookSecret();
    const envelope = encryptWebhookSecret(secret, context, key);

    expect(secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(envelope).toMatchObject({ keyVersion: 1 });
    expect(JSON.stringify(envelope)).not.toContain(secret);
    expect(decryptWebhookSecret(envelope, context, key)).toBe(secret);
  });

  it.each([
    "ciphertext",
    "nonce",
    "authTag",
  ] as const)("fails closed when %s is tampered", (field) => {
    const key = randomBytes(32);
    const secret = createWebhookSecret();
    const envelope = encryptWebhookSecret(secret, context, key);
    const replacement = envelope[field].endsWith("A") ? "B" : "A";
    const tampered = { ...envelope, [field]: `${envelope[field].slice(0, -1)}${replacement}` };

    expect(() => decryptWebhookSecret(tampered, context, key)).toThrow();
  });

  it("binds ciphertext to tenant, endpoint, environment, version, and key", () => {
    const key = randomBytes(32);
    const envelope = encryptWebhookSecret(createWebhookSecret(), context, key);

    expect(() =>
      decryptWebhookSecret(envelope, { ...context, merchantId: randomUUID() }, key),
    ).toThrow();
    expect(() =>
      decryptWebhookSecret(envelope, { ...context, endpointId: randomUUID() }, key),
    ).toThrow();
    expect(() => decryptWebhookSecret(envelope, { ...context, env: "live" }, key)).toThrow();
    expect(() => decryptWebhookSecret(envelope, context, randomBytes(32))).toThrow();
    expect(() => decryptWebhookSecret(envelope, { ...context, keyVersion: 2 }, key)).toThrow();
  });

  it("accepts only a base64url-encoded 32-byte infrastructure key", () => {
    const encoded = randomBytes(32).toString("base64url");
    expect(parseWebhookEncryptionKey(encoded)).toHaveLength(32);
    expect(() => parseWebhookEncryptionKey("too-short")).toThrow();
    expect(() => parseWebhookEncryptionKey(`${encoded}=`)).toThrow();
  });

  it("resolves versioned infrastructure keys without silently falling back", () => {
    const versionOne = randomBytes(32).toString("base64url");
    const versionTwo = randomBytes(32).toString("base64url");
    const environment = {
      WEBHOOK_SECRET_ENCRYPTION_KEY: versionOne,
      WEBHOOK_SECRET_ENCRYPTION_KEY_V2: versionTwo,
    };

    expect(resolveWebhookEncryptionKey(1, environment)).toEqual(
      Buffer.from(versionOne, "base64url"),
    );
    expect(resolveWebhookEncryptionKey(2, environment)).toEqual(
      Buffer.from(versionTwo, "base64url"),
    );
    expect(() => resolveWebhookEncryptionKey(3, environment)).toThrow();
    expect(() => resolveWebhookEncryptionKey(0, environment)).toThrow();
  });

  it("rejects non-canonical webhook secrets", () => {
    const key = randomBytes(32);

    expect(() => encryptWebhookSecret("whsec_short", context, key)).toThrow();
    expect(() => encryptWebhookSecret(`whsec_${"a".repeat(44)}`, context, key)).toThrow();
  });
});
