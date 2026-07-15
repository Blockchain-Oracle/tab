import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for order schema tests");

const sql = postgres(databaseUrl, { max: 4 });

async function merchant(label: string) {
  const [user] = await sql<{ id: string }[]>`
    insert into users (email, magic_issuer)
    values (${`${label}-${randomUUID()}@example.test`}, ${`did:ethr:${randomUUID()}`})
    returning id
  `;
  if (!user) throw new Error("Expected a user row");
  const [row] = await sql<{ id: string }[]>`
    insert into merchants (user_id, receiving_address)
    values (${user.id}, '0x1111111111111111111111111111111111111111')
    returning id
  `;
  if (!row) throw new Error("Expected a merchant row");
  return row.id;
}

async function payment(merchantId: string, refCode: string, env: "live" | "test" = "test") {
  await sql`
    insert into payments (
      merchant_id, ref_code, env, livemode, amount_usd, currency,
      receiver, token_address, token_chain_id, intent_url
    ) values (
      ${merchantId}, ${refCode}, ${env}, ${env === "live"}, '7.25', 'USD',
      '0x1111111111111111111111111111111111111111',
      '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', 42161,
      'https://merchant.example.test/intent'
    )
  `;
}

function order(
  merchantId: string,
  orderNumber: string,
  paymentRef: string,
  env: "live" | "test" = "test",
) {
  return sql<{ id: string }[]>`
    insert into orders (merchant_id, env, order_number, payment_ref)
    values (${merchantId}, ${env}, ${orderNumber}, ${paymentRef})
    returning id
  `;
}

describe("demo-shop order correlation with real PostgreSQL", () => {
  beforeEach(async () => {
    await sql`truncate table users cascade`;
  });

  afterAll(async () => {
    await sql.end();
  });

  it("persists a runtime-shaped order against its merchant payment reference", async () => {
    const merchantId = await merchant("order-valid");
    await payment(merchantId, "TAB-ORDER01");

    const [stored] = await order(merchantId, "SHOP-1001", "TAB-ORDER01");
    expect(stored?.id).toMatch(/^[0-9a-f-]{36}$/);
    const [row] = await sql<
      {
        created_at: Date;
        env: "live" | "test";
        merchant_id: string;
        order_number: string;
        payment_ref: string;
      }[]
    >`select merchant_id, env, order_number, payment_ref, created_at from orders`;
    expect(row).toMatchObject({
      merchant_id: merchantId,
      env: "test",
      order_number: "SHOP-1001",
      payment_ref: "TAB-ORDER01",
    });
    expect(row?.created_at).toBeInstanceOf(Date);
  });

  it("rejects cross-tenant and nonexistent payment references", async () => {
    const first = await merchant("order-first");
    const second = await merchant("order-second");
    await payment(first, "TAB-ORDER02");

    await expect(order(second, "SECOND-1001", "TAB-ORDER02")).rejects.toMatchObject({
      code: "23503",
    });
    await expect(order(first, "FIRST-1001", "TAB-MISSING")).rejects.toMatchObject({
      code: "23503",
    });
    await expect(order(first, "FIRST-1002", "TAB-ORDER02", "live")).rejects.toMatchObject({
      code: "23503",
    });
  });

  it("enforces one order per payment and merchant-scoped order numbers", async () => {
    const first = await merchant("order-unique-first");
    const second = await merchant("order-unique-second");
    await payment(first, "TAB-ORDER03");
    await payment(first, "TAB-ORDER04");
    await payment(second, "TAB-ORDER05");
    await payment(first, "TAB-ORDER06", "live");
    await order(first, "STORE-1001", "TAB-ORDER03");

    await expect(order(first, "STORE-1001", "TAB-ORDER04")).rejects.toMatchObject({
      code: "23505",
    });
    await expect(order(first, "STORE-1002", "TAB-ORDER03")).rejects.toMatchObject({
      code: "23505",
    });
    await expect(order(second, "STORE-1001", "TAB-ORDER05")).resolves.toHaveLength(1);
    await expect(order(first, "STORE-1001", "TAB-ORDER06", "live")).resolves.toHaveLength(1);
  });

  it("preserves order-to-payment audit evidence on attempted payment deletion", async () => {
    const merchantId = await merchant("order-audit");
    await payment(merchantId, "TAB-ORDER07");
    await order(merchantId, "AUDIT-1001", "TAB-ORDER07");

    await expect(sql`delete from payments where ref_code = 'TAB-ORDER07'`).rejects.toMatchObject({
      code: "23503",
    });
    const [stored] = await sql<{ payment_ref: string }[]>`select payment_ref from orders`;
    expect(stored?.payment_ref).toBe("TAB-ORDER07");
  });

  it("allows exactly one concurrent fulfillment writer per payment", async () => {
    const merchantId = await merchant("order-concurrent");
    await payment(merchantId, "TAB-ORDER08");

    const results = await Promise.allSettled([
      order(merchantId, "RACE-1001", "TAB-ORDER08"),
      order(merchantId, "RACE-1002", "TAB-ORDER08"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const [rejected] = results.filter((result) => result.status === "rejected");
    expect(rejected?.reason).toMatchObject({ code: "23505" });
    const [stored] = await sql<{ count: number }[]>`select count(*)::int as count from orders`;
    expect(stored?.count).toBe(1);
  });

  it.each([
    "",
    " ",
    "\n",
  ])("rejects a blank runtime-derived order number: %j", async (orderNumber) => {
    const merchantId = await merchant(`order-shape-${randomUUID()}`);
    const refCode = `TAB-${randomUUID().slice(0, 8).toUpperCase()}`;
    await payment(merchantId, refCode);
    await expect(order(merchantId, orderNumber, refCode)).rejects.toMatchObject({
      code: "23514",
    });
  });
});
