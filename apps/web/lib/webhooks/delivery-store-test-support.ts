import { randomUUID } from "node:crypto";

import { createDatabase } from "../db/client";
import { provisionMerchant } from "../db/provision-merchant";
import { payments, settlements, webhookDeliveries, webhookEndpoints } from "../db/schema";
import { serializePaymentSettledPayload } from "./payload";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for webhook ledger tests");

export const ledgerTestConnection = createDatabase(databaseUrl, 8);
export const validSignature = `t=123,v1=${"a".repeat(64)}`;

export async function resetLedgerTests() {
  await ledgerTestConnection.client`truncate table users cascade`;
}

export async function closeLedgerTests() {
  await ledgerTestConnection.client.end();
}

export async function createPendingPaymentDelivery() {
  const identity = await provisionMerchant(ledgerTestConnection.db, {
    email: `ledger-${randomUUID()}@example.test`,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x1111111111111111111111111111111111111111",
  });
  const endpointId = randomUUID();
  await ledgerTestConnection.db.insert(webhookEndpoints).values({
    env: "test",
    id: endpointId,
    merchantId: identity.merchantId,
    secretAuthTag: "AAAAAAAAAAAAAAAAAAAAAA",
    secretCiphertext: "ciphertext",
    secretKeyVersion: 1,
    secretLast4: "last",
    secretNonce: "AAAAAAAAAAAAAAAA",
    url: "https://merchant.example.test/webhook",
  });

  const transactionId = `test_${randomUUID()}`;
  const [payment] = await ledgerTestConnection.db
    .insert(payments)
    .values({
      amountUsd: "1.000000",
      currency: "USD",
      env: "test",
      intentUrl: "https://merchant.example.test/intent",
      livemode: false,
      merchantId: identity.merchantId,
      refCode: `TAB-${randomUUID().slice(0, 8).toUpperCase()}`,
      receiver: "0x1111111111111111111111111111111111111111",
      reportedAt: new Date(),
      reportedTokenChanges: [],
      reportedTransactionId: transactionId,
      settledAt: new Date(),
      status: "settled",
      tokenAddress: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
      tokenChainId: 42161,
    })
    .returning({ id: payments.id });
  if (!payment) throw new Error("Expected a payment row");
  const [settlement] = await ledgerTestConnection.db
    .insert(settlements)
    .values({
      amountAtomic: "1000000",
      livemode: false,
      particleTransactionId: transactionId,
      paymentId: payment.id,
      tokenChangesJson: [],
      verificationMethod: "simulated_test",
      verificationTrigger: "inline",
    })
    .returning({ id: settlements.id });
  if (!settlement) throw new Error("Expected a settlement row");

  const id = randomUUID();
  const eventId = `evt_${randomUUID().replaceAll("-", "")}`;
  const requestBody = serializePaymentSettledPayload({
    id,
    livemode: false,
    tokenChanges: [],
    transactionId,
  });
  const [delivery] = await ledgerTestConnection.db
    .insert(webhookDeliveries)
    .values({
      attempt: 1,
      endpointId,
      env: "test",
      eventId,
      id,
      merchantId: identity.merchantId,
      paymentId: payment.id,
      requestBody,
      retryChainId: id,
      settlementId: settlement.id,
      trigger: "auto",
      type: "payment",
    })
    .returning();
  if (!delivery) throw new Error("Expected a webhook delivery row");
  return delivery;
}
