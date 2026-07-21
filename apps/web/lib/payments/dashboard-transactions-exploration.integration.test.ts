import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import { provisionMerchant } from "../db/provision-merchant";
import { payments, webhookDeliveries, webhookEndpoints } from "../db/schema";
import { claimWebhookDelivery, finalizeWebhookDelivery } from "../webhooks/delivery-store";
import { promoteDueWebhookRetry } from "../webhooks/retry-ledger";
import { getDashboardTransaction, listDashboardTransactions } from "./dashboard-transactions";
import { reportPayment } from "./payment-report";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for dashboard transaction tests");

const connection = createDatabase(databaseUrl, 4);
const payerAddress = "0x2222222222222222222222222222222222222222";
const validSignature = `t=123,v1=${"a".repeat(64)}`;

async function merchant(label: string) {
  return provisionMerchant(connection.db, {
    email: `${label}-${randomUUID()}@example.test`,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x1111111111111111111111111111111111111111",
  });
}

async function payment(
  merchantId: string,
  createdAt = new Date(),
  payerType: "agent" | "human" = "human",
) {
  const [row] = await connection.db
    .insert(payments)
    .values({
      amountUsd: "7.250000",
      createdAt,
      currency: "USD",
      env: "test",
      intentUrl: "https://merchant.example.test/intent",
      livemode: false,
      merchantId,
      payerType,
      refCode: `TAB-${randomUUID().slice(0, 8).toUpperCase()}`,
      receiver: "0x1111111111111111111111111111111111111111",
      tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      tokenChainId: 42161,
    })
    .returning({ id: payments.id });
  if (!row) throw new Error("Expected a payment row");
  return row;
}

async function report(merchantId: string, paymentId: string) {
  return reportPayment(
    connection.db,
    { env: "test", merchantId },
    paymentId,
    { tokenChanges: [{ source: "dashboard-test" }], transactionId: `test_${randomUUID()}` },
    { payerAddress, payerEmail: "buyer@example.test" },
  );
}

async function promoteFailedAttempt(id: string) {
  const claim = await claimWebhookDelivery(connection.db, id);
  if (!claim?.leaseToken) throw new Error("Expected a delivery lease");
  await finalizeWebhookDelivery(connection.db, id, claim.leaseToken, {
    completedAt: new Date(),
    failureKind: "http",
    nextRetryAt: new Date(Date.now() - 1_000),
    responseBodySnippet: "unavailable",
    responseTimeMs: 6,
    result: "retrying",
    signatureHeader: validSignature,
    statusCode: 503,
  });
  const child = await promoteDueWebhookRetry(connection.db);
  if (!child) throw new Error("Expected a promoted webhook retry");
  return child;
}

beforeEach(() => connection.client`truncate table users cascade`);
afterAll(() => connection.client.end());

describe("merchant transaction exploration with real PostgreSQL", () => {
  it("paginates in both directions without duplicates using a stable cursor", async () => {
    const identity = await merchant("dashboard-cursors");
    const sharedTimestamp = new Date("2026-01-01T00:00:00Z");
    for (let index = 0; index < 41; index += 1) {
      await payment(identity.merchantId, sharedTimestamp);
    }

    const first = await listDashboardTransactions(connection.db, {
      env: "test",
      merchantId: identity.merchantId,
    });
    if (!first.nextCursor) throw new Error("Expected an older-page cursor");
    const second = await listDashboardTransactions(
      connection.db,
      { env: "test", merchantId: identity.merchantId },
      { cursor: first.nextCursor },
    );
    if (!second.previousCursor) throw new Error("Expected a newer-page cursor");
    expect(second.nextCursor).toBeTypeOf("string");
    const firstIds = new Set(first.rows.map((row) => row.paymentId));
    expect(second.rows.some((row) => firstIds.has(row.paymentId))).toBe(false);

    const back = await listDashboardTransactions(
      connection.db,
      { env: "test", merchantId: identity.merchantId },
      { cursor: second.previousCursor },
    );
    expect(back.rows.map((row) => row.paymentId)).toEqual(first.rows.map((row) => row.paymentId));
  });

  it("filters payment status and payer type within the tenant and mode", async () => {
    const identity = await merchant("dashboard-payment-filters");
    const human = await payment(identity.merchantId);
    const agent = await payment(identity.merchantId, new Date(), "agent");
    const failed = await payment(identity.merchantId);
    await connection.db
      .update(payments)
      .set({ failureReason: "PAYMENT_REJECTED", status: "failed" })
      .where(eq(payments.id, failed.id));

    const agentPage = await listDashboardTransactions(
      connection.db,
      { env: "test", merchantId: identity.merchantId },
      { payerType: "agent" },
    );
    expect(agentPage.rows.map((row) => row.paymentId)).toEqual([agent.id]);
    const failedPage = await listDashboardTransactions(
      connection.db,
      { env: "test", merchantId: identity.merchantId },
      { status: "failed" },
    );
    expect(failedPage.rows.map((row) => row.paymentId)).toEqual([failed.id]);
    expect(failedPage.rows.map((row) => row.paymentId)).not.toContain(human.id);
  });

  it("filters webhook state only from the current delivery ledger head", async () => {
    const identity = await merchant("dashboard-webhook-filter");
    await connection.db.insert(webhookEndpoints).values({
      env: "test",
      merchantId: identity.merchantId,
      secretAuthTag: "AAAAAAAAAAAAAAAAAAAAAA",
      secretCiphertext: "ciphertext",
      secretKeyVersion: 1,
      secretLast4: "last",
      secretNonce: "AAAAAAAAAAAAAAAA",
      url: "https://merchant.example.test/webhook",
    });
    const deliveredPayment = await payment(identity.merchantId);
    const untouchedPayment = await payment(identity.merchantId);
    const result = await report(identity.merchantId, deliveredPayment.id);
    if (!result.webhookDeliveryId) throw new Error("Expected an automatic delivery");
    const claim = await claimWebhookDelivery(connection.db, result.webhookDeliveryId);
    if (!claim?.leaseToken) throw new Error("Expected a delivery lease");
    await finalizeWebhookDelivery(connection.db, claim.id, claim.leaseToken, {
      completedAt: new Date(),
      responseBodySnippet: "ok",
      responseTimeMs: 6,
      result: "delivered",
      signatureHeader: `t=123,v1=${"a".repeat(64)}`,
      statusCode: 200,
    });

    const delivered = await listDashboardTransactions(
      connection.db,
      { env: "test", merchantId: identity.merchantId },
      { webhookResult: "delivered" },
    );
    expect(delivered.rows.map((row) => row.paymentId)).toEqual([deliveredPayment.id]);
    const none = await listDashboardTransactions(
      connection.db,
      { env: "test", merchantId: identity.merchantId },
      { webhookResult: "none" },
    );
    expect(none.rows.map((row) => row.paymentId)).toEqual([untouchedPayment.id]);
  });

  it("uses a successful manual resend as the latest payment-delivery evidence", async () => {
    const identity = await merchant("dashboard-manual-resend");
    await connection.db.insert(webhookEndpoints).values({
      env: "test",
      merchantId: identity.merchantId,
      secretAuthTag: "AAAAAAAAAAAAAAAAAAAAAA",
      secretCiphertext: "ciphertext",
      secretKeyVersion: 1,
      secretLast4: "last",
      secretNonce: "AAAAAAAAAAAAAAAA",
      url: "https://merchant.example.test/webhook",
    });
    const row = await payment(identity.merchantId);
    const settlement = await report(identity.merchantId, row.id);
    if (!settlement.webhookDeliveryId) throw new Error("Expected an automatic delivery");
    const second = await promoteFailedAttempt(settlement.webhookDeliveryId);
    const third = await promoteFailedAttempt(second.id);
    const claim = await claimWebhookDelivery(connection.db, third.id);
    if (!claim?.leaseToken) throw new Error("Expected an attempt-three lease");
    await finalizeWebhookDelivery(connection.db, third.id, claim.leaseToken, {
      completedAt: new Date(),
      failureKind: "http",
      responseBodySnippet: "unavailable",
      responseTimeMs: 6,
      result: "gave_up",
      signatureHeader: validSignature,
      statusCode: 503,
    });

    const manualId = randomUUID();
    await connection.db.insert(webhookDeliveries).values({
      attempt: 1,
      endpointId: third.endpointId,
      env: third.env,
      eventId: third.eventId,
      id: manualId,
      merchantId: third.merchantId,
      parentDeliveryId: third.id,
      paymentId: third.paymentId,
      requestBody: third.requestBody,
      retryChainId: manualId,
      settlementId: third.settlementId,
      trigger: "manual",
      type: third.type,
    });
    const manualClaim = await claimWebhookDelivery(connection.db, manualId);
    if (!manualClaim?.leaseToken) throw new Error("Expected a manual delivery lease");
    await finalizeWebhookDelivery(connection.db, manualId, manualClaim.leaseToken, {
      completedAt: new Date(),
      responseBodySnippet: "ok",
      responseTimeMs: 5,
      result: "delivered",
      signatureHeader: validSignature,
      statusCode: 200,
    });

    const delivered = await listDashboardTransactions(
      connection.db,
      { env: "test", merchantId: identity.merchantId },
      { webhookResult: "delivered" },
    );
    expect(delivered.rows).toMatchObject([
      { paymentId: row.id, webhook: { id: manualId, result: "delivered" } },
    ]);
    await expect(
      listDashboardTransactions(
        connection.db,
        { env: "test", merchantId: identity.merchantId },
        { webhookResult: "gave_up" },
      ),
    ).resolves.toMatchObject({ rows: [] });
  });

  it("loads scoped detail evidence without exposing the D5-gated payer email", async () => {
    const owner = await merchant("dashboard-detail-owner");
    const stranger = await merchant("dashboard-detail-stranger");
    const row = await payment(owner.merchantId);
    await report(owner.merchantId, row.id);

    const detail = await getDashboardTransaction(
      connection.db,
      { env: "test", merchantId: owner.merchantId },
      row.id,
    );
    expect(detail).toMatchObject({
      intentUrl: "https://merchant.example.test/intent",
      payerAddress,
      paymentId: row.id,
      reportedTokenChanges: [{ source: "dashboard-test" }],
      settlement: { verificationMethod: "simulated_test" },
    });
    expect(detail).not.toHaveProperty("payerEmail");
    await expect(
      getDashboardTransaction(
        connection.db,
        { env: "test", merchantId: stranger.merchantId },
        row.id,
      ),
    ).resolves.toBeNull();
    await expect(
      getDashboardTransaction(connection.db, { env: "live", merchantId: owner.merchantId }, row.id),
    ).resolves.toBeNull();
  });
});
