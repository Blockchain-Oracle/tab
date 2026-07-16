import { createHmac, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const magicBoundary = vi.hoisted(() => ({ verifyBuyerDidToken: vi.fn() }));

vi.mock("../auth/magic-admin", async (importOriginal) => {
  const original = await importOriginal<typeof import("../auth/magic-admin")>();
  return {
    ...original,
    magicAuthenticationConfigured: () => true,
    verifyBuyerDidToken: magicBoundary.verifyBuyerDidToken,
  };
});

import { GET as getDemoIntent } from "../../app/api/demo/intent/route";
import { POST as completeDemoOrder } from "../../app/api/demo/order/route";
import { PATCH as reportPayment } from "../../app/api/v1/payments/[id]/route";
import { POST as createPayment } from "../../app/api/v1/payments/route";
import { POST as createWebhookEndpoint } from "../../app/api/webhook-endpoint/route";
import { InvalidMagicTokenError } from "../auth/magic-admin";
import { createSessionToken, SESSION_COOKIE_NAME } from "../auth/session";
import { createDatabase } from "../db/client";
import { provisionMerchant } from "../db/provision-merchant";
import { merchants, orders, payments, settlements, webhookDeliveries } from "../db/schema";
import { closeServerDatabase } from "../db/server";
import { verifyPaymentIntentToken } from "../payments/payment-intent-token";

const databaseUrl = process.env.DATABASE_URL;
const sessionSecret = process.env.SESSION_SECRET;
if (!databaseUrl || !sessionSecret) throw new Error("Canonical demo integration env is required");

const connection = createDatabase(databaseUrl, 2);
const appOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost").origin;
const signingSecret = "canonical-demo-intent-secret-at-least-32-bytes";
const encryptionKey = Buffer.alloc(32, 19).toString("base64url");
const originalSigningSecret = process.env.PAYMENT_INTENT_SIGNING_SECRET;
const originalEncryptionKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
const servers: ReturnType<typeof createServer>[] = [];

async function receiver(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const instance = createServer(handler);
  servers.push(instance);
  await new Promise<void>((resolve) => instance.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(instance.address() as AddressInfo).port}/tab`;
}

async function merchant(label: string, businessName: string, receivingAddress: string) {
  const email = `${label}-${randomUUID()}@example.test`;
  const identity = await provisionMerchant(connection.db, {
    email,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress,
  });
  await connection.db
    .update(merchants)
    .set({ businessName })
    .where(eq(merchants.id, identity.merchantId));
  const session = await createSessionToken({ ...identity, email, mode: "test" });
  return { ...identity, cookie: `${SESSION_COOKIE_NAME}=${session}` };
}

function dashboardRequest(path: string, cookie: string, body?: unknown) {
  return new NextRequest(`${appOrigin}${path}`, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      cookie,
      ...(body === undefined ? {} : { "content-type": "application/json", origin: appOrigin }),
    },
    method: body === undefined ? "GET" : "POST",
  });
}

function checkoutRequest(path: string, key: string, method: "PATCH" | "POST", body: unknown) {
  return new NextRequest(`${appOrigin}${path}`, {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      origin: appOrigin,
    },
    method,
  });
}

beforeEach(async () => {
  process.env.PAYMENT_INTENT_SIGNING_SECRET = signingSecret;
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = encryptionKey;
  magicBoundary.verifyBuyerDidToken.mockReset();
  await connection.client`truncate table users cascade`;
});

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
});

afterAll(async () => {
  if (originalSigningSecret === undefined) delete process.env.PAYMENT_INTENT_SIGNING_SECRET;
  else process.env.PAYMENT_INTENT_SIGNING_SECRET = originalSigningSecret;
  if (originalEncryptionKey === undefined) delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  else process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = originalEncryptionKey;
  await closeServerDatabase();
  await connection.client.end();
});

describe("canonical per-merchant demo flow", () => {
  it("crosses real intent, auth, settlement, webhook, and order boundaries in labeled test mode", async () => {
    const received: Array<{ body: string; signature: string }> = [];
    const endpointUrl = await receiver((request, response) => {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => (body += chunk));
      request.on("end", () => {
        received.push({ body, signature: String(request.headers["x-tab-signature"]) });
        response.writeHead(204).end();
      });
    });
    const owner = await merchant(
      "canonical-owner",
      "Northwind Bakehouse",
      "0x1111111111111111111111111111111111111111",
    );
    const other = await merchant(
      "canonical-other",
      "Other Merchant",
      "0x2222222222222222222222222222222222222222",
    );
    const endpointResponse = await createWebhookEndpoint(
      dashboardRequest("/api/webhook-endpoint", owner.cookie, { url: endpointUrl }),
    );
    const endpoint = await endpointResponse.json();
    expect(endpointResponse.status).toBe(201);

    const intentResponse = await getDemoIntent(dashboardRequest("/api/demo/intent", owner.cookie));
    const intent = await intentResponse.json();
    expect(intentResponse.status).toBe(200);
    expect(intent.intent).toMatchObject({
      amount: "1.000000",
      mode: "test",
      receiver: "0x1111111111111111111111111111111111111111",
    });
    await expect(
      verifyPaymentIntentToken(intent.intentToken, { secret: signingSecret }),
    ).resolves.toMatchObject({ env: "test", merchantId: owner.merchantId });

    const foreignOpen = await createPayment(
      checkoutRequest("/api/v1/payments", other.publishableKeys.test, "POST", {
        intentToken: intent.intentToken,
      }),
    );
    expect(foreignOpen.status).toBe(400);
    expect(await connection.db.select().from(payments)).toHaveLength(0);

    const openResponse = await createPayment(
      checkoutRequest("/api/v1/payments", owner.publishableKeys.test, "POST", {
        intentToken: intent.intentToken,
      }),
    );
    const opened = await openResponse.json();
    expect(openResponse.status).toBe(201);
    expect(opened.payment).toMatchObject({ env: "test", livemode: false, status: "pending" });

    const didToken = "browser-issued-did-token-boundary";
    const transactionId = `test_${randomUUID()}`;
    const evidence = {
      buyerDidToken: didToken,
      tokenChanges: [{ amount: "1.000000", simulation: "simulated_test" }],
      transactionId,
    };
    magicBoundary.verifyBuyerDidToken.mockRejectedValueOnce(new InvalidMagicTokenError());
    const rejected = await reportPayment(
      checkoutRequest(
        `/api/v1/payments/${opened.paymentId}`,
        owner.publishableKeys.test,
        "PATCH",
        evidence,
      ),
      { params: Promise.resolve({ id: opened.paymentId }) },
    );
    expect(rejected.status).toBe(401);
    expect(await connection.db.select().from(settlements)).toHaveLength(0);

    const payerAddress = "0x9999999999999999999999999999999999999999";
    magicBoundary.verifyBuyerDidToken.mockResolvedValueOnce({
      email: "buyer@example.test",
      magicIssuer: "did:ethr:buyer",
      payerAddress,
    });
    const settled = await reportPayment(
      checkoutRequest(
        `/api/v1/payments/${opened.paymentId}`,
        owner.publishableKeys.test,
        "PATCH",
        evidence,
      ),
      { params: Promise.resolve({ id: opened.paymentId }) },
    );
    expect(settled.status).toBe(200);
    await expect(settled.json()).resolves.toMatchObject({
      payment: { status: "settled", verification: { method: "simulated_test" } },
      testMode: { simulated: true },
    });
    expect(magicBoundary.verifyBuyerDidToken).toHaveBeenLastCalledWith(didToken);

    const [storedPayment] = await connection.db
      .select()
      .from(payments)
      .where(eq(payments.id, opened.paymentId));
    const [storedSettlement] = await connection.db.select().from(settlements);
    const [storedDelivery] = await connection.db.select().from(webhookDeliveries);
    expect(storedPayment).toMatchObject({ payerAddress, status: "settled" });
    expect(storedSettlement).toMatchObject({
      livemode: false,
      particleTransactionId: transactionId,
      verificationMethod: "simulated_test",
    });
    expect(storedDelivery).toMatchObject({ result: "delivered", trigger: "auto", type: "payment" });
    expect(received).toHaveLength(1);
    const webhook = JSON.parse(received[0]?.body ?? "{}");
    expect(webhook).toMatchObject({
      livemode: false,
      tokenChanges: [{ simulation: "simulated_test" }],
      transactionId,
      type: "payment.settled",
    });
    const timestamp = Number(/^t=(\d+),/.exec(received[0]?.signature ?? "")?.[1]);
    const digest = createHmac("sha256", endpoint.secret)
      .update(`${timestamp}.${received[0]?.body}`)
      .digest("hex");
    expect(received[0]?.signature).toBe(`t=${timestamp},v1=${digest}`);

    const foreignOrder = await completeDemoOrder(
      dashboardRequest("/api/demo/order", other.cookie, { transactionId }),
    );
    expect(foreignOrder.status).toBe(404);
    const orderResponse = await completeDemoOrder(
      dashboardRequest("/api/demo/order", owner.cookie, { transactionId }),
    );
    expect(orderResponse.status).toBe(201);
    await expect(orderResponse.json()).resolves.toMatchObject({
      order: { orderNumber: "NB-0001", paymentRef: opened.refCode },
    });
    expect(await connection.db.select().from(orders)).toHaveLength(1);
  });
});
