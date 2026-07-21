import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createDatabase } from "./client";
import { findOrCreateOwnerIdentity, OwnerIdentityConflictError } from "./owner-identity";
import { provisionMerchant } from "./provision-merchant";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for PostgreSQL integration tests");
}

const connection = createDatabase(databaseUrl, 2);

function identity(label: string) {
  return {
    email: `${label}-${randomUUID()}@example.test`,
    magicIssuer: `did:ethr:${randomUUID()}`,
  };
}

describe("Agent owner identity provisioning with real PostgreSQL", () => {
  beforeEach(async () => {
    await connection.client`truncate table users cascade`;
  });

  afterAll(async () => {
    await connection.client`truncate table users cascade`;
    await connection.client.end();
  });

  it("creates only a user principal for a new Agent owner", async () => {
    const source = identity("new-owner");

    const owner = await findOrCreateOwnerIdentity(connection.db, source);
    const [counts] = await connection.client<
      { merchantsCount: number; usersCount: number }[]
    >`select
        (select count(*)::int from users) as "usersCount",
        (select count(*)::int from merchants) as "merchantsCount"`;

    expect(owner).toMatchObject({ email: source.email });
    expect(owner.userId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(counts).toEqual({ merchantsCount: 0, usersCount: 1 });
  });

  it("reuses the shared user principal when the owner already has a merchant", async () => {
    const source = identity("merchant-owner");
    const merchant = await provisionMerchant(connection.db, {
      ...source,
      receivingAddress: "0x1111111111111111111111111111111111111111",
    });

    await expect(findOrCreateOwnerIdentity(connection.db, source)).resolves.toEqual({
      email: source.email,
      userId: merchant.userId,
    });

    const [counts] = await connection.client<
      { merchantsCount: number; usersCount: number }[]
    >`select
        (select count(*)::int from users) as "usersCount",
        (select count(*)::int from merchants) as "merchantsCount"`;
    expect(counts).toEqual({ merchantsCount: 1, usersCount: 1 });
  });

  it("returns one principal when the same verified identity arrives concurrently", async () => {
    const source = identity("concurrent-owner");

    const [first, second] = await Promise.all([
      findOrCreateOwnerIdentity(connection.db, source),
      findOrCreateOwnerIdentity(connection.db, source),
    ]);

    expect(first).toEqual(second);
    const [count] = await connection.client<{ count: number }[]>`
      select count(*)::int as count from users
    `;
    expect(count?.count).toBe(1);
  });

  it("converges on one user when Agent login and merchant signup race", async () => {
    const source = identity("cross-product-race");

    const [owner, merchant] = await Promise.all([
      findOrCreateOwnerIdentity(connection.db, source),
      provisionMerchant(connection.db, {
        ...source,
        receivingAddress: "0x1111111111111111111111111111111111111111",
      }),
    ]);

    expect(merchant.userId).toBe(owner.userId);
    const [counts] = await connection.client<
      { merchantsCount: number; usersCount: number }[]
    >`select
        (select count(*)::int from users) as "usersCount",
        (select count(*)::int from merchants) as "merchantsCount"`;
    expect(counts).toEqual({ merchantsCount: 1, usersCount: 1 });
  });

  it("rejects an email or issuer collision instead of rebinding an owner", async () => {
    const source = identity("bound-owner");
    await findOrCreateOwnerIdentity(connection.db, source);

    await expect(
      findOrCreateOwnerIdentity(connection.db, {
        email: source.email,
        magicIssuer: `did:ethr:${randomUUID()}`,
      }),
    ).rejects.toBeInstanceOf(OwnerIdentityConflictError);
    await expect(
      findOrCreateOwnerIdentity(connection.db, {
        email: `other-${randomUUID()}@example.test`,
        magicIssuer: source.magicIssuer,
      }),
    ).rejects.toBeInstanceOf(OwnerIdentityConflictError);
  });
});
