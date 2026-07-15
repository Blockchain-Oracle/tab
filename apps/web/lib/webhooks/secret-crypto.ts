import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { isWebhookSecret } from "./secret-format";

export interface WebhookSecretContext {
  endpointId: string;
  env: "live" | "test";
  keyVersion: number;
  merchantId: string;
}

export interface WebhookSecretEnvelope {
  authTag: string;
  ciphertext: string;
  keyVersion: number;
  nonce: string;
}

export class WebhookSecretCryptoError extends Error {
  constructor(options?: ErrorOptions) {
    super("Webhook secret encryption failed", options);
    this.name = "WebhookSecretCryptoError";
  }
}

function keyBytes(key: Uint8Array) {
  if (key.byteLength !== 32) throw new WebhookSecretCryptoError();
  return Buffer.from(key);
}

function additionalData(context: WebhookSecretContext) {
  if (!Number.isSafeInteger(context.keyVersion) || context.keyVersion < 1) {
    throw new WebhookSecretCryptoError();
  }
  return Buffer.from(
    [
      "tab-webhook-secret-v1",
      context.keyVersion,
      context.endpointId,
      context.merchantId,
      context.env,
    ].join("\n"),
    "utf8",
  );
}

function decodeBase64Url(value: string, expectedBytes?: number) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new WebhookSecretCryptoError();
  const decoded = Buffer.from(value, "base64url");
  if (
    decoded.toString("base64url") !== value ||
    (expectedBytes && decoded.length !== expectedBytes)
  ) {
    throw new WebhookSecretCryptoError();
  }
  return decoded;
}

export function parseWebhookEncryptionKey(value: string) {
  return decodeBase64Url(value, 32);
}

export function resolveWebhookEncryptionKey(
  keyVersion: number,
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  if (!Number.isSafeInteger(keyVersion) || keyVersion < 1) {
    throw new WebhookSecretCryptoError();
  }
  const variableName =
    keyVersion === 1
      ? "WEBHOOK_SECRET_ENCRYPTION_KEY"
      : `WEBHOOK_SECRET_ENCRYPTION_KEY_V${keyVersion}`;
  const encodedKey = environment[variableName]?.trim();
  if (!encodedKey) throw new WebhookSecretCryptoError();
  return parseWebhookEncryptionKey(encodedKey);
}

export function createWebhookSecret() {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

export function encryptWebhookSecret(
  secret: string,
  context: WebhookSecretContext,
  key: Uint8Array,
): WebhookSecretEnvelope {
  if (!isWebhookSecret(secret)) throw new WebhookSecretCryptoError();
  try {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", keyBytes(key), nonce);
    cipher.setAAD(additionalData(context));
    const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    return {
      authTag: cipher.getAuthTag().toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
      keyVersion: context.keyVersion,
      nonce: nonce.toString("base64url"),
    };
  } catch (error) {
    if (error instanceof WebhookSecretCryptoError) throw error;
    throw new WebhookSecretCryptoError({ cause: error });
  }
}

export function decryptWebhookSecret(
  envelope: WebhookSecretEnvelope,
  context: WebhookSecretContext,
  key: Uint8Array,
) {
  try {
    if (envelope.keyVersion !== context.keyVersion) throw new WebhookSecretCryptoError();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      keyBytes(key),
      decodeBase64Url(envelope.nonce, 12),
    );
    decipher.setAAD(additionalData(context));
    decipher.setAuthTag(decodeBase64Url(envelope.authTag, 16));
    const plaintext = Buffer.concat([
      decipher.update(decodeBase64Url(envelope.ciphertext)),
      decipher.final(),
    ]).toString("utf8");
    if (!isWebhookSecret(plaintext)) throw new WebhookSecretCryptoError();
    return plaintext;
  } catch (error) {
    if (error instanceof WebhookSecretCryptoError) throw error;
    throw new WebhookSecretCryptoError({ cause: error });
  }
}
