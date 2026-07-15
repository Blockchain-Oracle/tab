import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for verification schema tests");

const sql = postgres(databaseUrl, { max: 1 });

async function payment(env: "live" | "test", reported: boolean) {
  const [user] = await sql<{ id: string }[]>`
    insert into users (email, magic_issuer)
    values (${`verification-${randomUUID()}@example.test`}, ${`did:ethr:${randomUUID()}`})
    returning id
  `;
  if (!user) throw new Error("Expected a user row");
  const [merchant] = await sql<{ id: string }[]>`
    insert into merchants (user_id, receiving_address)
    values (${user.id}, '0x1111111111111111111111111111111111111111')
    returning id
  `;
  if (!merchant) throw new Error("Expected a merchant row");
  const [row] = await sql<{ id: string }[]>`
    insert into payments (
      merchant_id, ref_code, env, livemode, amount_usd, currency, receiver,
      token_address, token_chain_id, intent_url, payer_address,
      reported_transaction_id, reported_token_changes, reported_at
    ) values (
      ${merchant.id}, ${`TAB-${randomUUID().slice(0, 8).toUpperCase()}`}, ${env},
      ${env === "live"}, '1', 'USD', '0x1111111111111111111111111111111111111111',
      '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', 42161,
      'https://merchant.example.test/intent',
      ${reported ? "0x9999999999999999999999999999999999999999" : null},
      ${reported ? `live_candidate_${randomUUID()}` : null}, ${reported ? [] : null},
      ${reported ? new Date() : null}
    ) returning id
  `;
  if (!row) throw new Error("Expected a payment row");
  return row.id;
}

describe("payment verification lease schema", () => {
  beforeEach(async () => {
    await sql`truncate table users cascade`;
  });

  afterAll(async () => {
    await sql.end();
  });

  it("accepts only paired leases on reported pending live payments", async () => {
    const liveId = await payment("live", true);
    const unpairedId = await payment("live", true);
    const testId = await payment("test", true);
    const unreportedId = await payment("live", false);

    await expect(sql`
      update payments set
        verification_lease_token = ${randomUUID()},
        verification_lease_expires_at = clock_timestamp() + interval '30 seconds'
      where id = ${liveId}
      returning id
    `).resolves.toHaveLength(1);
    await expect(sql`
      update payments set verification_lease_token = ${randomUUID()}
      where id = ${unpairedId}
    `).rejects.toMatchObject({ code: "23514" });
    await expect(sql`
      update payments set
        verification_lease_token = ${randomUUID()},
        verification_lease_expires_at = clock_timestamp() + interval '30 seconds'
      where id = ${testId}
    `).rejects.toMatchObject({ code: "23514" });
    await expect(sql`
      update payments set
        verification_lease_token = ${randomUUID()},
        verification_lease_expires_at = clock_timestamp() + interval '30 seconds'
      where id = ${unreportedId}
    `).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects a verification schedule on rows that cannot be verified live", async () => {
    const testId = await payment("test", true);
    const unreportedId = await payment("live", false);

    for (const id of [testId, unreportedId]) {
      await expect(sql`
        update payments set verification_next_attempt_at = clock_timestamp()
        where id = ${id}
      `).rejects.toMatchObject({ code: "23514" });
    }
  });
});
