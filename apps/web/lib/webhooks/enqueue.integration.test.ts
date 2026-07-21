import { createHash, randomBytes, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import { provisionMerchant } from "../db/provision-merchant";
import { payments, settlements, webhookDeliveries, webhookEndpoints } from "../db/schema";
import { reportPayment } from "../payments/payment-report";
import { serializePaymentSettledPayload } from "./payload";
import { createWebhookSecret, encryptWebhookSecret } from "./secret-crypto";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for webhook enqueue tests");

const connection = createDatabase(databaseUrl, 4);
const payerAddress = "0x9999999999999999999999999999999999999999";

async function merchant() {
  return provisionMerchant(connection.db, {
    email: `enqueue-${randomUUID()}@example.test`,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x1111111111111111111111111111111111111111",
  });
}

async function payment(merchantId: string) {
  const [row] = await connection.db
    .insert(payments)
    .values({
      amountUsd: "7.250000",
      currency: "USD",
      env: "test",
      intentUrl: "https://merchant.example.test/payment-intent",
      livemode: false,
      merchantId,
      refCode: `TAB-${randomUUID().slice(0, 8).toUpperCase()}`,
      receiver: "0x1111111111111111111111111111111111111111",
      tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      tokenChainId: 42161,
    })
    .returning({ id: payments.id });
  if (!row) throw new Error("Expected a payment row");
  return row.id;
}

async function endpoint(merchantId: string) {
  const id = randomUUID();
  const context = { endpointId: id, env: "test" as const, keyVersion: 1, merchantId };
  const secret = createWebhookSecret();
  const envelope = encryptWebhookSecret(secret, context, randomBytes(32));
  await connection.db.insert(webhookEndpoints).values({
    id,
    env: "test",
    merchantId,
    secretAuthTag: envelope.authTag,
    secretCiphertext: envelope.ciphertext,
    secretKeyVersion: envelope.keyVersion,
    secretLast4: secret.slice(-4),
    secretNonce: envelope.nonce,
    url: "https://merchant.example.test/webhook",
  });
}

function evidence() {
  return {
    tokenChanges: [{ from: payerAddress, source: "tab_normalized_candidate" }],
    transactionId: `test_${randomUUID()}`,
  };
}

describe("transactional webhook enqueue with real PostgreSQL", () => {
  beforeEach(async () => {
    await connection.client`truncate table users cascade`;
  });

  afterAll(async () => {
    await connection.client.end();
  });

  it("atomically creates one byte-stable root under concurrent settlement replay", async () => {
    const identity = await merchant();
    await endpoint(identity.merchantId);
    const paymentId = await payment(identity.merchantId);
    const report = evidence();
    const principal = { env: "test" as const, merchantId: identity.merchantId };

    const results = await Promise.all([
      reportPayment(connection.db, principal, paymentId, report, {
        payerAddress,
        payerEmail: "buyer@example.test",
      }),
      reportPayment(connection.db, principal, paymentId, report, {
        payerAddress,
        payerEmail: "buyer@example.test",
      }),
    ]);
    const deliveries = await connection.db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.paymentId, paymentId));
    const [settlement] = await connection.db
      .select()
      .from(settlements)
      .where(eq(settlements.paymentId, paymentId));

    expect(settlement).toBeDefined();
    expect(deliveries).toHaveLength(1);
    const delivery = deliveries[0];
    if (!delivery || !settlement) throw new Error("Expected settlement and delivery rows");
    expect(results.map((result) => result.webhookDeliveryId)).toEqual([delivery.id, delivery.id]);
    const expectedBody = serializePaymentSettledPayload({
      id: delivery.id,
      livemode: false,
      transactionId: report.transactionId,
      tokenChanges: settlement.tokenChangesJson,
    });
    expect(delivery).toMatchObject({
      attempt: 1,
      requestBody: expectedBody,
      requestBodyHash: createHash("sha256").update(expectedBody).digest("hex"),
      result: "pending",
      retryChainId: delivery.id,
      trigger: "auto",
      type: "payment",
    });
  });

  it("never retroactively enqueues when no endpoint existed at settlement time", async () => {
    const identity = await merchant();
    const paymentId = await payment(identity.merchantId);
    const report = evidence();
    const principal = { env: "test" as const, merchantId: identity.merchantId };

    const first = await reportPayment(connection.db, principal, paymentId, report, {
      payerAddress,
      payerEmail: "buyer@example.test",
    });
    await endpoint(identity.merchantId);
    const replay = await reportPayment(connection.db, principal, paymentId, report, {
      payerAddress,
      payerEmail: "buyer@example.test",
    });

    expect(first.webhookDeliveryId).toBeNull();
    expect(replay.webhookDeliveryId).toBeNull();
    expect(await connection.db.select().from(webhookDeliveries)).toHaveLength(0);
  });
});
