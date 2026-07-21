import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import { provisionMerchant } from "../db/provision-merchant";
import { users } from "../db/schema";
import { createSessionToken } from "./session";
import {
  InactiveMerchantSessionError,
  InvalidMerchantSessionError,
  loadMerchantSession,
} from "./session-principal";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for PostgreSQL integration tests");
}

const secret = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const connection = createDatabase(databaseUrl, 1);

function signupInput(email: string) {
  return {
    email,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x1111111111111111111111111111111111111111",
  };
}

describe("protected merchant session lookup with real PostgreSQL", () => {
  beforeEach(async () => {
    await connection.client`
      truncate table quickstart_progress, api_keys, merchants, users cascade
    `;
  });

  afterAll(async () => {
    await connection.client.end();
  });

  it("reloads the signed principal from the current tenant rows", async () => {
    const provisioned = await provisionMerchant(connection.db, signupInput("owner@example.test"));
    const token = await createSessionToken(
      {
        email: "owner@example.test",
        merchantId: provisioned.merchantId,
        mode: "test",
        userId: provisioned.userId,
      },
      secret,
    );

    await expect(loadMerchantSession(connection.db, token, secret)).resolves.toEqual({
      businessName: null,
      email: "owner@example.test",
      liveActivatedAt: null,
      logoEtag: null,
      logoUrl: null,
      merchantId: provisioned.merchantId,
      mode: "test",
      receivingAddress: "0x1111111111111111111111111111111111111111",
      receivingAddressSource: "magic_default",
      userId: provisioned.userId,
    });
  });

  it("classifies an invalid signed cookie without touching tenant data", async () => {
    await expect(loadMerchantSession(connection.db, "not-a-jwt", secret)).rejects.toBeInstanceOf(
      InvalidMerchantSessionError,
    );
  });

  it("rejects an agent-only owner token at the shape check, before touching tenant data", async () => {
    const email = "agent-only@example.test";
    const [owner] = await connection.db
      .insert(users)
      .values({ email, magicIssuer: `did:ethr:${randomUUID()}` })
      .returning({ userId: users.id });
    if (!owner) throw new Error("PostgreSQL did not return the owner user");
    const token = await createSessionToken({ email, userId: owner.userId }, secret);

    await expect(loadMerchantSession(connection.db, token, secret)).rejects.toBeInstanceOf(
      InvalidMerchantSessionError,
    );
  });

  it("rejects an owner-only token even when the same user owns a merchant — separate privilege domains", async () => {
    const provisioned = await provisionMerchant(
      connection.db,
      signupInput("shared-owner@example.test"),
    );
    const token = await createSessionToken(
      { email: "shared-owner@example.test", userId: provisioned.userId },
      secret,
    );

    await expect(loadMerchantSession(connection.db, token, secret)).rejects.toBeInstanceOf(
      InvalidMerchantSessionError,
    );
  });

  it("rejects a signed session after its tenant is deleted", async () => {
    const provisioned = await provisionMerchant(connection.db, signupInput("deleted@example.test"));
    const token = await createSessionToken(
      {
        email: "deleted@example.test",
        merchantId: provisioned.merchantId,
        mode: "test",
        userId: provisioned.userId,
      },
      secret,
    );

    await connection.client`delete from users where id = ${provisioned.userId}`;

    await expect(loadMerchantSession(connection.db, token, secret)).rejects.toBeInstanceOf(
      InactiveMerchantSessionError,
    );
  });

  it("rejects a valid signature whose user and merchant do not belong together", async () => {
    const first = await provisionMerchant(connection.db, signupInput("first@example.test"));
    const second = await provisionMerchant(connection.db, signupInput("second@example.test"));
    const token = await createSessionToken(
      {
        email: "first@example.test",
        merchantId: second.merchantId,
        mode: "test",
        userId: first.userId,
      },
      secret,
    );

    await expect(loadMerchantSession(connection.db, token, secret)).rejects.toBeInstanceOf(
      InactiveMerchantSessionError,
    );
  });
});
