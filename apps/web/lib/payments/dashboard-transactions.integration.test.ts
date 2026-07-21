import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import { provisionMerchant } from "../db/provision-merchant";
import { payments, webhookEndpoints } from "../db/schema";
import { claimWebhookDelivery, finalizeWebhookDelivery } from "../webhooks/delivery-store";
import { promoteDueWebhookRetry } from "../webhooks/retry-ledger";
import { listDashboardTransactions } from "./dashboard-transactions";
import { reportPayment } from "./payment-report";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for dashboard transaction tests");

const connection = createDatabase(databaseUrl, 4);
const payerAddress = "0x2222222222222222222222222222222222222222";
const signature = `t=123,v1=${"a".repeat(64)}`;

async function merchant(label: string) {
  return provisionMerchant(connection.db, {
    email: `${label}-${randomUUID()}@example.test`,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x1111111111111111111111111111111111111111",
  });
}

async function payment(merchantId: string, env: "live" | "test", createdAt = new Date()) {
  const [row] = await connection.db
    .insert(payments)
    .values({
      amountUsd: "7.250000",
      createdAt,
      currency: "USD",
      env,
      intentUrl: "https://merchant.example.test/intent",
      livemode: env === "live",
      merchantId,
      refCode: `TAB-${randomUUID().slice(0, 8).toUpperCase()}`,
      receiver: "0x1111111111111111111111111111111111111111",
      tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      tokenChainId: 42161,
    })
    .returning({ id: payments.id, refCode: payments.refCode });
  if (!row) throw new Error("Expected a payment row");
  return row;
}

async function endpoint(merchantId: string) {
  await connection.db.insert(webhookEndpoints).values({
    env: "test",
    merchantId,
    secretAuthTag: "AAAAAAAAAAAAAAAAAAAAAA",
    secretCiphertext: "ciphertext",
    secretKeyVersion: 1,
    secretLast4: "last",
    secretNonce: "AAAAAAAAAAAAAAAA",
    url: "https://merchant.example.test/webhook",
  });
}

async function report(merchantId: string, paymentId: string, transactionId: string) {
  return reportPayment(
    connection.db,
    { env: "test", merchantId },
    paymentId,
    { tokenChanges: [{ source: "dashboard-test" }], transactionId },
    { payerAddress, payerEmail: "buyer@example.test" },
  );
}

beforeEach(() => connection.client`truncate table users cascade`);
afterAll(() => connection.client.end());

describe("merchant dashboard transaction reads with real PostgreSQL", () => {
  it("returns a genuine empty result", async () => {
    const identity = await merchant("dashboard-empty");
    await expect(
      listDashboardTransactions(connection.db, {
        env: "test",
        merchantId: identity.merchantId,
      }),
    ).resolves.toEqual({
      hasMore: false,
      nextCursor: null,
      previousCursor: null,
      rows: [],
    });
  });

  it("isolates merchant and mode while bounding newest-first results", async () => {
    const first = await merchant("dashboard-first");
    const second = await merchant("dashboard-second");
    const created: { refCode: string }[] = [];
    for (let index = 0; index < 21; index += 1) {
      created.push(
        await payment(first.merchantId, "test", new Date(Date.UTC(2026, 0, 1, 0, index))),
      );
    }
    await payment(first.merchantId, "live", new Date("2027-01-01T00:00:00Z"));
    await payment(second.merchantId, "test", new Date("2028-01-01T00:00:00Z"));

    const page = await listDashboardTransactions(connection.db, {
      env: "test",
      merchantId: first.merchantId,
    });

    expect(page).toMatchObject({ hasMore: true });
    expect(page.rows).toHaveLength(20);
    expect(page.rows[0]?.refCode).toBe(created.at(-1)?.refCode);
    expect(page.rows.every((row) => row.env === "test")).toBe(true);
  });

  it("reads the real simulated settlement and automatic delivery outcome", async () => {
    const identity = await merchant("dashboard-settled");
    await endpoint(identity.merchantId);
    const row = await payment(identity.merchantId, "test");
    const result = await report(identity.merchantId, row.id, `test_${randomUUID()}`);
    if (!result.webhookDeliveryId) throw new Error("Expected an automatic delivery");

    const pending = await listDashboardTransactions(connection.db, {
      env: "test",
      merchantId: identity.merchantId,
    });
    expect(pending.rows[0]).toMatchObject({
      settlement: { verificationMethod: "simulated_test" },
      status: "settled",
      webhook: { attempt: 1, result: "pending" },
    });
    expect(pending.rows[0]).not.toHaveProperty("payerEmail");

    const claim = await claimWebhookDelivery(connection.db, result.webhookDeliveryId);
    if (!claim?.leaseToken) throw new Error("Expected a delivery lease");
    await finalizeWebhookDelivery(connection.db, claim.id, claim.leaseToken, {
      completedAt: new Date(),
      responseBodySnippet: "ok",
      responseTimeMs: 4,
      result: "delivered",
      signatureHeader: signature,
      statusCode: 204,
    });
    const delivered = await listDashboardTransactions(connection.db, {
      env: "test",
      merchantId: identity.merchantId,
    });
    expect(delivered.rows[0]?.webhook).toMatchObject({ result: "delivered", statusCode: 204 });
  });

  it("selects the unsuperseded automatic retry head", async () => {
    const identity = await merchant("dashboard-retry");
    await endpoint(identity.merchantId);
    const row = await payment(identity.merchantId, "test");
    const result = await report(identity.merchantId, row.id, `test_${randomUUID()}`);
    if (!result.webhookDeliveryId) throw new Error("Expected an automatic delivery");
    const claim = await claimWebhookDelivery(connection.db, result.webhookDeliveryId);
    if (!claim?.leaseToken) throw new Error("Expected a delivery lease");
    await finalizeWebhookDelivery(connection.db, claim.id, claim.leaseToken, {
      completedAt: new Date(),
      failureKind: "http",
      nextRetryAt: new Date(Date.now() - 1_000),
      responseBodySnippet: "retry",
      responseTimeMs: 3,
      result: "retrying",
      signatureHeader: signature,
      statusCode: 503,
    });
    const child = await promoteDueWebhookRetry(connection.db);
    if (!child) throw new Error("Expected retry promotion");

    const page = await listDashboardTransactions(connection.db, {
      env: "test",
      merchantId: identity.merchantId,
    });
    expect(page.rows).toHaveLength(1);
    expect(page.rows.map((transaction) => transaction.paymentId)).toEqual([row.id]);
    expect(page.rows[0]?.webhook).toMatchObject({ id: child.id, attempt: 2, result: "pending" });
  });

  it("keeps a reported live payment visibly pending without invented settlement data", async () => {
    const identity = await merchant("dashboard-live");
    const row = await payment(identity.merchantId, "live");
    const transactionId = `live_candidate_${randomUUID()}`;
    await reportPayment(
      connection.db,
      { env: "live", merchantId: identity.merchantId },
      row.id,
      { tokenChanges: [{ source: "live-candidate" }], transactionId },
      { payerAddress, payerEmail: "buyer@example.test" },
    );

    const page = await listDashboardTransactions(connection.db, {
      env: "live",
      merchantId: identity.merchantId,
    });
    expect(page.rows[0]).toMatchObject({
      reportedTransactionId: transactionId,
      settlement: null,
      status: "pending",
      webhook: null,
    });
  });
});
