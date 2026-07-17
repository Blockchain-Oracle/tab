import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createDatabase } from "../db/client";
import { provisionMerchant } from "../db/provision-merchant";
import { users } from "../db/schema";
import { authenticateOwnerRequest } from "./owner-request";
import {
  InactiveOwnerSessionError,
  InvalidOwnerSessionError,
  loadOwnerSession,
} from "./owner-session";
import { createSessionToken } from "./session";

vi.mock("server-only", () => ({}));

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for PostgreSQL integration tests");
}

const secret = "x".repeat(64);
const connection = createDatabase(databaseUrl, 1);

function signupInput(label: string) {
  return {
    email: `${label}-${randomUUID()}@example.test`,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x1111111111111111111111111111111111111111",
  };
}

async function ownerSession(label: string) {
  const email = `${label}-${randomUUID()}@example.test`;
  const [owner] = await connection.db
    .insert(users)
    .values({ email, magicIssuer: `did:ethr:${randomUUID()}` })
    .returning({ userId: users.id });
  if (!owner) throw new Error("PostgreSQL did not return the Leash owner");
  const token = await createSessionToken({ email, userId: owner.userId }, secret);
  return { email, token, userId: owner.userId };
}

describe("Leash owner session lookup with real PostgreSQL", () => {
  beforeEach(async () => {
    await connection.client`truncate table users cascade`;
  });

  afterAll(async () => {
    await connection.client.end();
  });

  it("loads only the signed user as the Leash owner", async () => {
    const owner = await ownerSession("valid-owner");

    await expect(loadOwnerSession(connection.db, owner.token, secret)).resolves.toStrictEqual({
      email: owner.email,
      userId: owner.userId,
    });
  });

  it("rejects a signed session whose user id and email identify different users", async () => {
    const first = await ownerSession("cross-first");
    const second = await ownerSession("cross-second");
    const crossedToken = await createSessionToken(
      {
        email: second.email,
        userId: first.userId,
      },
      secret,
    );

    await expect(loadOwnerSession(connection.db, crossedToken, secret)).rejects.toBeInstanceOf(
      InactiveOwnerSessionError,
    );
  });

  it("rejects a signed session after the user is deleted", async () => {
    const owner = await ownerSession("deleted-owner");
    await connection.db.delete(users);

    await expect(loadOwnerSession(connection.db, owner.token, secret)).rejects.toBeInstanceOf(
      InactiveOwnerSessionError,
    );
  });

  it("rejects a forged session signature", async () => {
    const owner = await ownerSession("forged-owner");
    const [header, payload, signature = ""] = owner.token.split(".");
    const forgedSignature = `${signature.startsWith("a") ? "b" : "a"}${signature.slice(1)}`;
    const forgedToken = `${header}.${payload}.${forgedSignature}`;

    await expect(loadOwnerSession(connection.db, forgedToken, secret)).rejects.toBeInstanceOf(
      InvalidOwnerSessionError,
    );
  });

  it("does not promote a foreign merchant resource claim into owner scope", async () => {
    const signedOwner = await ownerSession("resource-owner");
    const foreignInput = signupInput("resource-foreign");
    const foreignMerchant = await provisionMerchant(connection.db, foreignInput);
    const mismatchedResourceToken = await createSessionToken(
      {
        email: signedOwner.email,
        merchantId: foreignMerchant.merchantId,
        mode: "live",
        userId: signedOwner.userId,
      },
      secret,
    );

    await expect(
      loadOwnerSession(connection.db, mismatchedResourceToken, secret),
    ).resolves.toStrictEqual({
      email: signedOwner.email,
      userId: signedOwner.userId,
    });
  });

  it("authenticates an owner request from the existing tab_session cookie", async () => {
    const owner = await ownerSession("request-owner");
    const requestToken = await createSessionToken({
      email: owner.email,
      userId: owner.userId,
    });
    const request = new NextRequest("https://tab.example.test/api/leash/caps", {
      headers: { cookie: `tab_session=${requestToken}` },
    });

    await expect(authenticateOwnerRequest(request)).resolves.toStrictEqual({
      email: owner.email,
      userId: owner.userId,
    });
  });

  it("returns one unauthenticated result for missing, invalid, and inactive owner cookies", async () => {
    const owner = await ownerSession("request-inactive");
    const inactiveToken = await createSessionToken({ email: owner.email, userId: owner.userId });
    await connection.db.delete(users);
    const requests = [
      new NextRequest("https://tab.example.test/api/leash/caps"),
      new NextRequest("https://tab.example.test/api/leash/caps", {
        headers: { cookie: "tab_session=not-a-jwt" },
      }),
      new NextRequest("https://tab.example.test/api/leash/caps", {
        headers: { cookie: `tab_session=${inactiveToken}` },
      }),
    ];

    for (const request of requests) {
      await expect(authenticateOwnerRequest(request)).resolves.toBeUndefined();
    }
  });
});
