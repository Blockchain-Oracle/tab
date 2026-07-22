import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { hashTypedData, isAddressEqual, recoverTypedDataAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { Database } from "../db/client";
import { agentSigners } from "../db/leash-control-schema";
import { MagicExpressError } from "./magic-express";

/**
 * Tab-hosted agent signer: the key is generated server-side, encrypted at
 * rest (AES-256-GCM, AAD-bound to the signer subject), and NEVER appears in
 * agent context or API responses. Every security property the product
 * promises — cap enforced outside the model, kill switch, keyless agent —
 * holds identically; only custody differs from the Magic TEE backend, which
 * remains selectable via AGENT_SIGNER_BACKEND=magic once the Magic account
 * is enabled for Server Wallets.
 *
 * Mirrors the MagicExpressClient contract exactly (getOrCreateWallet,
 * signTypedData) and throws the same MagicExpressError codes so gates,
 * receipts, and UI need no changes.
 */

type TypedDataInput = Parameters<typeof hashTypedData>[0];

function encryptionKey() {
  const encoded = process.env.AGENT_SIGNER_ENCRYPTION_KEY?.trim();
  if (!encoded) throw new MagicExpressError("SIGNER_NOT_CONFIGURED");
  const key = Buffer.from(encoded, "base64url");
  if (key.byteLength !== 32) throw new MagicExpressError("SIGNER_NOT_CONFIGURED");
  return key;
}

function encrypt(subject: string, privateKey: `0x${string}`) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  cipher.setAAD(Buffer.from(subject, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(privateKey, "utf8"), cipher.final()]);
  return {
    authTag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    nonce: nonce.toString("base64url"),
  };
}

function decrypt(subject: string, row: typeof agentSigners.$inferSelect) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(row.keyNonce, "base64url"),
  );
  decipher.setAAD(Buffer.from(subject, "utf8"));
  decipher.setAuthTag(Buffer.from(row.keyAuthTag, "base64url"));
  try {
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(row.keyCiphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    return plaintext as `0x${string}`;
  } catch {
    throw new MagicExpressError("SIGNER_PROVIDER_INVALID_RESPONSE");
  }
}

export class TabSignerClient {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async getOrCreateWallet(subject: string): Promise<string> {
    const [existing] = await this.#db
      .select()
      .from(agentSigners)
      .where(eq(agentSigners.subject, subject))
      .limit(1);
    if (existing) return existing.address;

    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const envelope = encrypt(subject, privateKey);
    const [inserted] = await this.#db
      .insert(agentSigners)
      .values({
        address: account.address,
        keyAuthTag: envelope.authTag,
        keyCiphertext: envelope.ciphertext,
        keyNonce: envelope.nonce,
        subject,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted) return inserted.address;

    // Concurrent provision: the other writer won; read their address.
    const [row] = await this.#db
      .select()
      .from(agentSigners)
      .where(eq(agentSigners.subject, subject))
      .limit(1);
    if (!row) throw new MagicExpressError("SIGNER_PROVIDER_UNAVAILABLE");
    return row.address;
  }

  async signTypedData(options: {
    address: `0x${string}`;
    subject: string;
    typedData: TypedDataInput;
  }) {
    const [row] = await this.#db
      .select()
      .from(agentSigners)
      .where(eq(agentSigners.subject, options.subject))
      .limit(1);
    if (!row) throw new MagicExpressError("SIGNER_NOT_CONFIGURED");
    if (!isAddressEqual(row.address as `0x${string}`, options.address)) {
      throw new MagicExpressError("SIGNER_IDENTITY_MISMATCH");
    }

    const account = privateKeyToAccount(decrypt(options.subject, row));
    const digest = hashTypedData(options.typedData);
    const signature = await account.signTypedData(options.typedData);
    const recovered = await recoverTypedDataAddress({ ...options.typedData, signature });
    if (!isAddressEqual(recovered, options.address)) {
      throw new MagicExpressError("SIGNER_IDENTITY_MISMATCH");
    }
    return { digest, signature };
  }
}

/** True when the Tab-hosted signer can operate. */
export function isTabSignerConfigured() {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}
