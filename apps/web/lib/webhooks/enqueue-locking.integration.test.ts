import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import { provisionMerchant } from "../db/provision-merchant";
import { webhookEndpoints } from "../db/schema";
import { lockActiveWebhookEndpoint } from "./enqueue";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for enqueue locking tests");
const connection = createDatabase(databaseUrl, 4);

function postgresCode(error: unknown) {
  let current = error;
  const seen = new Set<unknown>();
  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && typeof current.code === "string") return current.code;
    current = "cause" in current ? current.cause : null;
  }
  return null;
}

beforeEach(async () => {
  await connection.client`truncate table users cascade`;
});

afterAll(async () => {
  await connection.client.end();
});

describe("transactional webhook endpoint selection", () => {
  it("blocks soft-delete from splicing into an active enqueue selection", async () => {
    const identity = await provisionMerchant(connection.db, {
      email: `enqueue-lock-${randomUUID()}@example.test`,
      magicIssuer: `did:ethr:${randomUUID()}`,
      receivingAddress: "0x1111111111111111111111111111111111111111",
    });
    const [endpoint] = await connection.db
      .insert(webhookEndpoints)
      .values({
        env: "test",
        merchantId: identity.merchantId,
        secretAuthTag: "AAAAAAAAAAAAAAAAAAAAAA",
        secretCiphertext: "ciphertext",
        secretKeyVersion: 1,
        secretLast4: "last",
        secretNonce: "AAAAAAAAAAAAAAAA",
        url: "https://merchant.example.test/webhook",
      })
      .returning({ id: webhookEndpoints.id });
    if (!endpoint) throw new Error("Expected an endpoint");

    let signalLocked: () => void = () => undefined;
    const locked = new Promise<void>((resolve) => {
      signalLocked = resolve;
    });
    let releaseLock: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const holder = connection.db.transaction(async (transaction) => {
      const selected = await lockActiveWebhookEndpoint(transaction, identity.merchantId, "test");
      expect(selected?.id).toBe(endpoint.id);
      signalLocked();
      await released;
    });
    await locked;

    const blocked = await connection.db
      .transaction(async (transaction) => {
        await transaction.execute(sql`set local lock_timeout = '100ms'`);
        await transaction
          .update(webhookEndpoints)
          .set({
            deletedAt: new Date(),
            secretAuthTag: null,
            secretCiphertext: null,
            secretKeyVersion: null,
            secretNonce: null,
          })
          .where(eq(webhookEndpoints.id, endpoint.id));
      })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(postgresCode(blocked)).toBe("55P03");
    releaseLock();
    await holder;

    await expect(
      connection.db
        .update(webhookEndpoints)
        .set({
          deletedAt: new Date(),
          secretAuthTag: null,
          secretCiphertext: null,
          secretKeyVersion: null,
          secretNonce: null,
        })
        .where(eq(webhookEndpoints.id, endpoint.id)),
    ).resolves.toBeDefined();
  });
});
