import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "./client";
import { MerchantAlreadyExistsError, provisionMerchant } from "./provision-merchant";
import { users } from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for PostgreSQL integration tests");
}

const connection = createDatabase(databaseUrl, 1);

function signupInput(email = `merchant-${randomUUID()}@example.test`) {
  return {
    email,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x1111111111111111111111111111111111111111",
  };
}

function errorMessages(error: unknown) {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current = error;

  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    if ("message" in current && typeof current.message === "string") {
      messages.push(current.message);
    }
    current = "cause" in current ? current.cause : undefined;
  }

  return messages.join("\n");
}

function requiredRow<T>(rows: T[], context: string): T {
  const row = rows[0];
  if (!row) {
    throw new Error(`PostgreSQL returned no row for ${context}`);
  }
  return row;
}

async function removeRejectKeyTrigger() {
  await connection.client.unsafe(`
    drop trigger if exists reject_test_api_key on api_keys;
    drop function if exists reject_test_api_key();
  `);
}

describe("merchant provisioning with real PostgreSQL", () => {
  beforeAll(async () => {
    const databaseRow = requiredRow(
      await connection.client<{ current_database: string }[]>`select current_database()`,
      "current database",
    );
    const databaseName = databaseRow.current_database;

    if (databaseName !== "tab_test") {
      throw new Error(`Refusing to reset non-test database: ${databaseName}`);
    }
  });

  beforeEach(async () => {
    await removeRejectKeyTrigger();
    await connection.client`
      truncate table quickstart_progress, api_keys, merchants, users cascade
    `;
  });

  afterAll(async () => {
    await removeRejectKeyTrigger();
    await connection.client.end();
  });

  it("atomically creates a principal, merchant, and test/live publishable keys", async () => {
    const input = signupInput("New.Merchant@example.test");
    const result = await provisionMerchant(connection.db, input);

    const [user] = await connection.client<
      { email: string; magic_issuer: string }[]
    >`select email, magic_issuer from users`;
    const [merchant] = await connection.client<
      { id: string; receiving_address: string; user_id: string }[]
    >`select id, receiving_address, user_id from merchants`;
    const keys = await connection.client<
      { env: string; last4: string; public_key: string; secret_hash: string | null }[]
    >`select env, last4, public_key, secret_hash from api_keys order by env`;

    expect(user).toEqual({
      email: "new.merchant@example.test",
      magic_issuer: input.magicIssuer,
    });
    expect(merchant).toMatchObject({
      id: result.merchantId,
      receiving_address: input.receivingAddress,
      user_id: result.userId,
    });
    expect(keys).toHaveLength(2);
    expect(keys.map((key) => key.env).sort()).toEqual(["live", "test"]);
    expect(keys.every((key) => key.secret_hash === null)).toBe(true);
    expect(keys.every((key) => key.public_key.endsWith(key.last4))).toBe(true);
    expect(keys.find((key) => key.env === "test")?.public_key).toMatch(/^pk_test_/);
    expect(keys.find((key) => key.env === "live")?.public_key).toMatch(/^pk_live_/);
  });

  it("attaches merchant resources to an exact verified Leash-first principal", async () => {
    const input = signupInput("leash-first@example.test");
    const [owner] = await connection.db
      .insert(users)
      .values({ email: input.email, magicIssuer: input.magicIssuer })
      .returning({ userId: users.id });
    if (!owner) throw new Error("PostgreSQL did not return the Leash-first owner");

    const result = await provisionMerchant(connection.db, input);

    expect(result.userId).toBe(owner.userId);
    const countRow = requiredRow(
      await connection.client<{ users_count: number; merchants_count: number }[]>`select
          (select count(*)::int from users) as users_count,
          (select count(*)::int from merchants) as merchants_count`,
      "shared principal counts",
    );
    expect({
      merchantsCount: countRow.merchants_count,
      usersCount: countRow.users_count,
    }).toEqual({ merchantsCount: 1, usersCount: 1 });
  });

  it("rejects a bare-user email or issuer collision without attaching a merchant", async () => {
    const input = signupInput("bound-owner@example.test");
    await connection.db
      .insert(users)
      .values({ email: input.email, magicIssuer: input.magicIssuer });

    await expect(
      provisionMerchant(connection.db, {
        ...input,
        magicIssuer: `did:ethr:${randomUUID()}`,
      }),
    ).rejects.toBeInstanceOf(MerchantAlreadyExistsError);
    await expect(
      provisionMerchant(connection.db, {
        ...input,
        email: `other-${randomUUID()}@example.test`,
      }),
    ).rejects.toBeInstanceOf(MerchantAlreadyExistsError);

    const [count] = await connection.client<{ count: number }[]>`
      select count(*)::int as count from merchants
    `;
    expect(count?.count).toBe(0);
  });

  it("rejects a case-insensitive duplicate email without creating another tenant", async () => {
    await provisionMerchant(connection.db, signupInput("owner@example.test"));

    await expect(
      provisionMerchant(connection.db, signupInput("OWNER@example.test")),
    ).rejects.toBeInstanceOf(MerchantAlreadyExistsError);

    const countRow = requiredRow(
      await connection.client<{ users_count: number; merchants_count: number }[]>`select
          (select count(*)::int from users) as users_count,
          (select count(*)::int from merchants) as merchants_count`,
      "tenant counts",
    );

    expect({
      merchantsCount: countRow.merchants_count,
      usersCount: countRow.users_count,
    }).toEqual({ usersCount: 1, merchantsCount: 1 });
  });

  it("rejects secret keys without explicit permissions", async () => {
    const { merchantId } = await provisionMerchant(connection.db, signupInput());
    const validHash = "a".repeat(64);

    await expect(
      connection.client`
        insert into api_keys (
          merchant_id, name, type, permissions, env, prefix, last4, secret_hash
        ) values (
          ${merchantId}, 'Invalid secret key', 'secret', null, 'test', 'sk_test_', 'aaaa', ${validHash}
        )
      `,
    ).rejects.toThrow();
  });

  it("rejects secret key material that is not a lowercase SHA-256 hex digest", async () => {
    const { merchantId } = await provisionMerchant(connection.db, signupInput());

    await expect(
      connection.client`
        insert into api_keys (
          merchant_id, name, type, permissions, env, prefix, last4, secret_hash
        ) values (
          ${merchantId}, 'Invalid secret key', 'secret', 'full', 'test', 'sk_test_', 'nope', 'not-a-sha256-digest'
        )
      `,
    ).rejects.toThrow();
  });

  it("rejects secret keys with missing hash material", async () => {
    const { merchantId } = await provisionMerchant(connection.db, signupInput());

    await expect(
      connection.client`
        insert into api_keys (
          merchant_id, name, type, permissions, env, prefix, last4, secret_hash
        ) values (
          ${merchantId}, 'Missing secret hash', 'secret', 'full', 'test', 'sk_test_', 'none', null
        )
      `,
    ).rejects.toThrow();
  });

  it("rolls back and preserves non-identity unique violations", async () => {
    await connection.client.unsafe(`
      create or replace function reject_test_api_key() returns trigger as $$
      begin
        raise unique_violation using
          message = 'forced integration failure',
          constraint = 'api_keys_public_key_unique';
      end;
      $$ language plpgsql;
      create trigger reject_test_api_key
      before insert on api_keys
      for each row execute function reject_test_api_key();
    `);

    let failure: unknown;
    try {
      await provisionMerchant(connection.db, signupInput());
    } catch (error) {
      failure = error;
    } finally {
      await removeRejectKeyTrigger();
    }

    expect(failure).toBeDefined();
    expect(failure).not.toBeInstanceOf(MerchantAlreadyExistsError);
    expect(errorMessages(failure)).toContain("forced integration failure");

    const countRow = requiredRow(
      await connection.client<{ users_count: number; merchants_count: number }[]>`select
          (select count(*)::int from users) as users_count,
          (select count(*)::int from merchants) as merchants_count`,
      "rollback counts",
    );

    expect({
      merchantsCount: countRow.merchants_count,
      usersCount: countRow.users_count,
    }).toEqual({ usersCount: 0, merchantsCount: 0 });
  });
});
