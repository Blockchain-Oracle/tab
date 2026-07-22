import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import { provisionMerchant } from "../db/provision-merchant";
import { payments, settlements, webhookDeliveries, webhookEndpoints } from "../db/schema";
import { dispatchWebhookDeliveryById } from "../webhooks/deliver";
import { createWebhookSecret, encryptWebhookSecret } from "../webhooks/secret-crypto";
import { reportPayment } from "./payment-report";
import { paymentReportResponseBody } from "./payment-report-response";
import { fakeTxHash, verifiedTestTransfer } from "./verify-test-support";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for callback parity tests");

const connection = createDatabase(databaseUrl, 2);
const encryptionKey = randomBytes(32);
const merchantReceiver = "0x1111111111111111111111111111111111111111";
const originalEncryptionKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
const servers: ReturnType<typeof createServer>[] = [];

async function webhookReceiver() {
  let resolveBody!: (body: unknown) => void;
  const received = new Promise<unknown>((resolve) => {
    resolveBody = resolve;
  });
  const instance = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      resolveBody(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      response.writeHead(204).end();
    });
  });
  servers.push(instance);
  await new Promise<void>((resolve) => instance.listen(0, "127.0.0.1", resolve));
  const port = (instance.address() as AddressInfo).port;
  return { received, url: `http://127.0.0.1:${port}/payment-settled` };
}

beforeEach(async () => {
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = encryptionKey.toString("base64url");
  await connection.client`truncate table users cascade`;
});

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (instance) =>
          new Promise<void>((resolve, reject) =>
            instance.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
});

afterAll(async () => {
  if (originalEncryptionKey === undefined) delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  else process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = originalEncryptionKey;
  await connection.client.end();
});

describe("test callback and webhook settlement parity", () => {
  it("uses one canonical server tokenChanges value across report, storage, queue, and HTTP", async () => {
    const receiver = await webhookReceiver();
    const identity = await provisionMerchant(connection.db, {
      email: `callback-parity-${randomUUID()}@example.test`,
      magicIssuer: `did:ethr:${randomUUID()}`,
      receivingAddress: merchantReceiver,
    });
    const endpointId = randomUUID();
    const secret = createWebhookSecret();
    const envelope = encryptWebhookSecret(
      secret,
      { endpointId, env: "test", keyVersion: 1, merchantId: identity.merchantId },
      encryptionKey,
    );
    await connection.db.insert(webhookEndpoints).values({
      env: "test",
      id: endpointId,
      merchantId: identity.merchantId,
      secretAuthTag: envelope.authTag,
      secretCiphertext: envelope.ciphertext,
      secretKeyVersion: envelope.keyVersion,
      secretLast4: secret.slice(-4),
      secretNonce: envelope.nonce,
      url: receiver.url,
    });
    const [payment] = await connection.db
      .insert(payments)
      .values({
        amountUsd: "12.000000",
        currency: "USD",
        env: "test",
        intentUrl: "https://merchant.example.test/payment-intent",
        livemode: false,
        merchantId: identity.merchantId,
        refCode: `TAB-${randomUUID().slice(0, 8).toUpperCase()}`,
        receiver: merchantReceiver,
        tokenAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        tokenChainId: 84532,
      })
      .returning({ id: payments.id });
    if (!payment) throw new Error("Expected payment");
    const transactionId = fakeTxHash();

    const result = await reportPayment(
      connection.db,
      { env: "test", merchantId: identity.merchantId },
      payment.id,
      { tokenChanges: [{ caller: "candidate-only" }], transactionId },
      {
        payerAddress: "0x9999999999999999999999999999999999999999",
        payerEmail: "buyer@example.test",
      },
      verifiedTestTransfer,
    );
    if (result.status !== "settled") throw new Error("Expected test settlement");
    const responseBody = paymentReportResponseBody(payment.id, result, "test");
    if (responseBody.payment.status !== "settled") throw new Error("Expected settled response");

    const [storedSettlement] = await connection.db
      .select()
      .from(settlements)
      .where(eq(settlements.paymentId, payment.id));
    const [queuedDelivery] = await connection.db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, result.webhookDeliveryId ?? randomUUID()));
    if (!storedSettlement || !queuedDelivery) throw new Error("Expected settlement and webhook");
    const queuedBody = JSON.parse(queuedDelivery.requestBody) as { tokenChanges: unknown[] };

    expect(responseBody.payment.tokenChanges).toEqual(storedSettlement.tokenChangesJson);
    expect(queuedBody.tokenChanges).toEqual(responseBody.payment.tokenChanges);

    await dispatchWebhookDeliveryById(connection.db, queuedDelivery.id, { allowLocalHttp: true });
    await expect(receiver.received).resolves.toMatchObject({
      tokenChanges: responseBody.payment.tokenChanges,
      transactionId,
      type: "payment.settled",
    });
  });
});
