import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { webhookDeliveries } from "../db/schema";
import { dispatchWebhookDeliveryById } from "./deliver";
import {
  closeDeliveryTests,
  createPendingWebhookDelivery,
  deliveryTestConnection,
  deliveryTestEncryptionKey,
  resetDeliveryTests,
} from "./deliver-test-support";
import { signWebhookPayload } from "./signature";

const servers: ReturnType<typeof createServer>[] = [];
const originalEncryptionKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;

async function server(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const instance = createServer(handler);
  servers.push(instance);
  await new Promise<void>((resolve) => instance.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(instance.address() as AddressInfo).port}`;
}

function dispatch(id: string) {
  return dispatchWebhookDeliveryById(deliveryTestConnection.db, id, { allowLocalHttp: true });
}

beforeEach(async () => {
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = deliveryTestEncryptionKey.toString("base64url");
  await resetDeliveryTests();
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
  await closeDeliveryTests();
});

describe("webhook dispatch with real PostgreSQL and HTTP", () => {
  it("sends once under concurrent dispatch and holds no database lock over the network", async () => {
    let posts = 0;
    let releaseResponse: () => void = () => undefined;
    const release = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    let requestReceived: (request: IncomingMessage) => void = () => undefined;
    const received = new Promise<IncomingMessage>((resolve) => {
      requestReceived = resolve;
    });
    const endpoint = await server((request, response) => {
      posts += 1;
      request.resume();
      request.on("end", () => requestReceived(request));
      void release.then(() => response.writeHead(204).end());
    });
    const { delivery, secret } = await createPendingWebhookDelivery(`${endpoint}/hook`);

    const dispatches = [dispatch(delivery.id), dispatch(delivery.id)];
    const request = await received;
    await expect(
      deliveryTestConnection.db.transaction((transaction) =>
        transaction
          .select({ id: webhookDeliveries.id })
          .from(webhookDeliveries)
          .where(eq(webhookDeliveries.id, delivery.id))
          .for("update"),
      ),
    ).resolves.toHaveLength(1);
    releaseResponse();
    await Promise.all(dispatches);

    const [stored] = await deliveryTestConnection.db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, delivery.id));
    expect(posts).toBe(1);
    expect(stored).toMatchObject({ leaseToken: null, result: "delivered", statusCode: 204 });
    const signature = request.headers["x-tab-signature"];
    expect(signature).toEqual(stored?.signatureHeader);
    const timestamp = Number(/^t=(\d+),/.exec(String(signature))?.[1]);
    expect(signature).toBe(signWebhookPayload(delivery.requestBody, secret, timestamp));
  });

  it("records a real non-2xx response as a scheduled retry", async () => {
    const endpoint = await server((request, response) => {
      request.resume();
      response.writeHead(500).end("merchant\0 unavailable");
    });
    const { delivery } = await createPendingWebhookDelivery(`${endpoint}/failure`);
    const before = Date.now();

    await dispatch(delivery.id);

    const [stored] = await deliveryTestConnection.db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, delivery.id));
    expect(stored).toMatchObject({
      failureKind: "http",
      responseBodySnippet: "merchant� unavailable",
      result: "retrying",
      statusCode: 500,
    });
    expect(stored?.nextRetryAt?.getTime()).toBeGreaterThanOrEqual(before + 60_000);
  });

  it("fails closed without a decryption key and never opens a socket", async () => {
    let posts = 0;
    const endpoint = await server((_request, response) => {
      posts += 1;
      response.writeHead(204).end();
    });
    const { delivery } = await createPendingWebhookDelivery(`${endpoint}/config`);
    delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;

    await dispatch(delivery.id);

    const [stored] = await deliveryTestConnection.db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, delivery.id));
    expect(posts).toBe(0);
    expect(stored).toMatchObject({ failureKind: "configuration", result: "failed" });
  });
});
