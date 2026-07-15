import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for PostgreSQL integration tests");
}

const sql = postgres(databaseUrl, { max: 1 });

async function createMerchant() {
  const [user] = await sql<{ id: string }[]>`
    insert into users (email, magic_issuer)
    values (${`phase3-${randomUUID()}@example.test`}, ${`did:ethr:${randomUUID()}`})
    returning id
  `;
  if (!user) throw new Error("Expected a user row");

  const [merchant] = await sql<{ id: string }[]>`
    insert into merchants (user_id, receiving_address)
    values (${user.id}, '0x1111111111111111111111111111111111111111')
    returning id
  `;
  if (!merchant) throw new Error("Expected a merchant row");
  return merchant.id;
}

function insertPayment(
  merchantId: string,
  values: { amount?: string; currency?: string; refCode: string },
) {
  return sql`
    insert into payments (
      merchant_id, ref_code, env, livemode, amount_usd, currency,
      receiver, token_address, token_chain_id, intent_url
    ) values (
      ${merchantId}, ${values.refCode}, 'test', false, ${values.amount ?? "1"},
      ${values.currency ?? "USD"}, '0x1111111111111111111111111111111111111111',
      '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', 42161,
      'https://merchant.example.test/intent'
    )
  `;
}

describe("Phase 3 PostgreSQL schema", () => {
  beforeEach(async () => {
    await sql`truncate table users cascade`;
  });

  afterAll(async () => {
    await sql.end();
  });

  it("creates every canonical Tab backend table", async () => {
    const rows = await sql<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in (
          'payments', 'settlements'
        )
      order by table_name
    `;

    expect(rows.map((row) => row.table_name)).toEqual(["payments", "settlements"]);
  });

  it("enforces server-authoritative payment invariants", async () => {
    const merchantId = await createMerchant();

    const [payment] = await sql<{ amount_usd: string }[]>`
      insert into payments (
        merchant_id, ref_code, env, livemode, amount_usd, currency,
        receiver, token_address, token_chain_id, intent_url
      ) values (
        ${merchantId}, 'TAB-EXACT1', 'test', false, '12.345678', 'USD',
        '0x1111111111111111111111111111111111111111',
        '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', 42161,
        'https://merchant.example.test/intent'
      ) returning amount_usd
    `;
    expect(payment?.amount_usd).toBe("12.345678");

    await expect(
      insertPayment(merchantId, { amount: "12.3456784", refCode: "TAB-SCALE01" }),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      insertPayment(merchantId, { amount: "-1", refCode: "TAB-NEGATIVE" }),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      insertPayment(merchantId, { currency: "EUR", refCode: "TAB-CURRENCY" }),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(insertPayment(merchantId, { refCode: "REF-WRONG" })).rejects.toMatchObject({
      code: "23514",
    });

    await expect(
      sql`
        insert into payments (
          merchant_id, ref_code, env, livemode, amount_usd, currency,
          receiver, token_address, token_chain_id, intent_url
        ) values (
          ${merchantId}, 'TAB-ZERO01', 'test', false, '0', 'USD',
          '0x1111111111111111111111111111111111111111',
          '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', 42161,
          'https://merchant.example.test/intent'
        )
      `,
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      sql`
        insert into payments (
          merchant_id, ref_code, env, livemode, amount_usd, currency,
          receiver, token_address, token_chain_id, intent_url
        ) values (
          ${merchantId}, 'TAB-TOKEN1', 'test', false, '1', 'USD',
          '0x1111111111111111111111111111111111111111',
          '0x2222222222222222222222222222222222222222', 42161,
          'https://merchant.example.test/intent'
        )
      `,
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      sql`
        insert into payments (
          merchant_id, ref_code, env, livemode, amount_usd, currency,
          receiver, token_address, token_chain_id, intent_url
        ) values (
          ${merchantId}, 'TAB-CHAIN1', 'test', false, '1', 'USD',
          '0x1111111111111111111111111111111111111111',
          '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', 8453,
          'https://merchant.example.test/intent'
        )
      `,
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      sql`
        insert into payments (
          merchant_id, ref_code, env, livemode, amount_usd, currency,
          receiver, token_address, token_chain_id, intent_url
        ) values (
          ${merchantId}, 'TAB-MODE01', 'live', false, '1', 'USD',
          '0x1111111111111111111111111111111111111111',
          '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', 42161,
          'https://merchant.example.test/intent'
        )
      `,
    ).rejects.toMatchObject({ code: "23514" });
  });
});
