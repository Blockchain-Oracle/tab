import { randomBytes, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { createDatabase } from "../db/client";
import { provisionMerchant } from "../db/provision-merchant";
import { payments, webhookDeliveries, webhookEndpoints } from "../db/schema";
import { reportPayment } from "../payments/payment-report";
import { createWebhookSecret, encryptWebhookSecret } from "./secret-crypto";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for delivery tests");

export const deliveryTestConnection = createDatabase(databaseUrl, 4);
export const deliveryTestEncryptionKey = randomBytes(32);

export async function resetDeliveryTests() {
  await deliveryTestConnection.client`truncate table users cascade`;
}

export async function closeDeliveryTests() {
  await deliveryTestConnection.client.end();
}

async function createPayment(merchantId: string) {
  const [row] = await deliveryTestConnection.db
    .insert(payments)
    .values({
      amountUsd: "3.500000",
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

export async function createPendingWebhookDelivery(endpointUrl: string) {
  const identity = await provisionMerchant(deliveryTestConnection.db, {
    email: `deliver-${randomUUID()}@example.test`,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x1111111111111111111111111111111111111111",
  });
  const endpointId = randomUUID();
  const secret = createWebhookSecret();
  const envelope = encryptWebhookSecret(
    secret,
    {
      endpointId,
      env: "test",
      keyVersion: 1,
      merchantId: identity.merchantId,
    },
    deliveryTestEncryptionKey,
  );
  await deliveryTestConnection.db.insert(webhookEndpoints).values({
    env: "test",
    id: endpointId,
    merchantId: identity.merchantId,
    secretAuthTag: envelope.authTag,
    secretCiphertext: envelope.ciphertext,
    secretKeyVersion: 1,
    secretLast4: secret.slice(-4),
    secretNonce: envelope.nonce,
    url: endpointUrl,
  });
  const paymentId = await createPayment(identity.merchantId);
  const result = await reportPayment(
    deliveryTestConnection.db,
    { env: "test", merchantId: identity.merchantId },
    paymentId,
    { tokenChanges: [], transactionId: `test_${randomUUID()}` },
    { payerAddress: "0x9999999999999999999999999999999999999999" },
  );
  if (!result.webhookDeliveryId) throw new Error("Expected a delivery id");
  const [delivery] = await deliveryTestConnection.db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.id, result.webhookDeliveryId));
  if (!delivery) throw new Error("Expected a delivery row");
  return { delivery, secret };
}
