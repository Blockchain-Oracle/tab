import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const sql = postgres(databaseUrl, { max: 1 });

async function createMerchant() {
  const [user] = await sql<{ id: string }[]>`
    insert into users (email, magic_issuer)
    values (${`settlement-${randomUUID()}@example.test`}, ${`did:ethr:${randomUUID()}`})
    returning id
  `;
  if (!user) throw new Error("Expected a user row");

  const [merchant] = await sql<{ id: string }[]>`
    insert into merchants (user_id, receiving_address)
    values (${user.id}, '0x1111111111111111111111111111111111111111') returning id
  `;
  if (!merchant) throw new Error("Expected a merchant row");
  return merchant.id;
}

async function createPayment(merchantId: string, transactionId?: string) {
  const [payment] = await sql<{ id: string }[]>`
    insert into payments (
      merchant_id, ref_code, env, livemode, amount_usd, currency, receiver,
      token_address, token_chain_id, intent_url, reported_transaction_id,
      reported_token_changes, reported_at
    ) values (
      ${merchantId}, ${`TAB-${randomUUID().slice(0, 8).toUpperCase()}`}, 'test', false,
      '12.000000', 'USD', '0x1111111111111111111111111111111111111111',
      '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', 42161,
      'https://merchant.example.test/intent', ${transactionId ?? null},
      ${transactionId ? sql`'[]'::jsonb` : null}, ${transactionId ? sql`now()` : null}
    ) returning id
  `;
  if (!payment) throw new Error("Expected a payment row");
  return payment.id;
}

function insertSettlement(paymentId: string, transactionId: string, amountAtomic = "12000000") {
  return sql`
    insert into settlements (
      payment_id, particle_transaction_id, token_changes_json, amount_atomic,
      verification_method, verification_trigger, livemode
    ) values (
      ${paymentId}, ${transactionId}, '[]'::jsonb, ${amountAtomic},
      'simulated_test', 'inline', false
    )
  `;
}

describe("Phase 3 settlement evidence schema", () => {
  beforeEach(async () => {
    await sql`truncate table users cascade`;
  });

  afterAll(async () => {
    await sql.end();
  });

  it("rejects partial candidate reports", async () => {
    const merchantId = await createMerchant();

    await expect(
      sql`
        insert into payments (
          merchant_id, ref_code, env, livemode, amount_usd, currency, receiver,
          token_address, token_chain_id, intent_url, reported_transaction_id, reported_at
        ) values (
          ${merchantId}, 'TAB-PARTIAL1', 'test', false, '1', 'USD',
          '0x1111111111111111111111111111111111111111',
          '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', 42161,
          'https://merchant.example.test/intent', 'candidate-1', now()
        )
      `,
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("ties verified settlement evidence to its report and mode", async () => {
    const merchantId = await createMerchant();
    const paymentId = await createPayment(merchantId, "candidate-1");
    await insertSettlement(paymentId, "candidate-1");

    await expect(insertSettlement(paymentId, "candidate-1")).rejects.toMatchObject({
      code: "23505",
    });

    const otherPaymentId = await createPayment(merchantId, "candidate-2");
    await expect(insertSettlement(otherPaymentId, "different-candidate")).rejects.toMatchObject({
      code: "23503",
    });

    await expect(
      sql`
        insert into settlements (
          payment_id, particle_transaction_id, token_changes_json, amount_atomic,
          verification_method, verification_trigger, livemode
        ) values (
          ${otherPaymentId}, 'candidate-2', '[]'::jsonb, '12000000',
          'particle', 'inline', true
        )
      `,
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("allows repeated unverified candidates but reserves verified transaction IDs", async () => {
    const merchantId = await createMerchant();
    const firstId = await createPayment(merchantId, "shared-candidate");
    const secondId = await createPayment(merchantId, "shared-candidate");

    await insertSettlement(firstId, "shared-candidate");
    await expect(insertSettlement(secondId, "shared-candidate")).rejects.toMatchObject({
      code: "23505",
    });
  });

  it("rejects fractional atomic amounts instead of rounding them", async () => {
    const paymentId = await createPayment(await createMerchant(), "candidate-atomic");

    await expect(
      insertSettlement(paymentId, "candidate-atomic", "12000000.5"),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("retains ledger rows instead of cascading merchant deletion", async () => {
    const merchantId = await createMerchant();
    const paymentId = await createPayment(merchantId, "candidate-retained");
    await insertSettlement(paymentId, "candidate-retained");

    await expect(sql`delete from merchants where id = ${merchantId}`).rejects.toMatchObject({
      code: "23503",
    });
    await expect(sql`delete from payments where id = ${paymentId}`).rejects.toMatchObject({
      code: "23503",
    });
  });
});
