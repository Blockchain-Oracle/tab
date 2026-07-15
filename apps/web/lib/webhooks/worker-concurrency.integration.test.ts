import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { webhookDeliveries } from "../db/schema";
import { dispatchWebhookDeliveryById } from "./deliver";
import {
  closeDeliveryTests,
  createPendingWebhookDelivery,
  deliveryTestConnection,
  deliveryTestEncryptionKey,
  resetDeliveryTests,
} from "./deliver-test-support";
import { drainWebhookDeliveryQueue } from "./worker";

type ResponseHandler = (response: ServerResponse) => void;

const originalEncryptionKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
let posts = 0;
let respond: ResponseHandler = (response) => response.writeHead(204).end();
const server = createServer((request, response) => {
  posts += 1;
  request.resume();
  respond(response);
});

beforeAll(async () => {
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = deliveryTestEncryptionKey.toString("base64url");
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

beforeEach(async () => {
  posts = 0;
  respond = (response) => response.writeHead(204).end();
  await resetDeliveryTests();
});

afterAll(async () => {
  if (originalEncryptionKey === undefined) delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  else process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = originalEncryptionKey;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await closeDeliveryTests();
});

function endpointUrl() {
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/concurrent-worker`;
}

function drain(maxDeliveries = 4) {
  return drainWebhookDeliveryQueue(deliveryTestConnection.db, {
    allowLocalHttp: true,
    maxDeliveries,
  });
}

async function makeDue(id: string) {
  await deliveryTestConnection.db
    .update(webhookDeliveries)
    .set({ nextRetryAt: new Date(Date.now() - 1_000) })
    .where(eq(webhookDeliveries.id, id));
}

describe("concurrent webhook outbox draining", () => {
  it("creates one retry child and sends each eligible attempt once across two workers", async () => {
    respond = (response) => response.writeHead(503).end("retry");
    const retryRoot = await createPendingWebhookDelivery(endpointUrl());
    await dispatchWebhookDeliveryById(deliveryTestConnection.db, retryRoot.delivery.id, {
      allowLocalHttp: true,
    });
    await makeDue(retryRoot.delivery.id);
    const pendingRoot = await createPendingWebhookDelivery(endpointUrl());
    respond = (response) => response.writeHead(204).end();

    await Promise.all([drain(2), drain(2)]);

    const retryChain = await deliveryTestConnection.db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.retryChainId, retryRoot.delivery.id))
      .orderBy(asc(webhookDeliveries.attempt));
    const [pending] = await deliveryTestConnection.db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, pendingRoot.delivery.id));
    expect(retryChain.map(({ result }) => result)).toEqual(["failed", "delivered"]);
    expect(pending).toMatchObject({ result: "delivered" });
    expect(posts).toBe(3);
  });

  it("commits retry promotion before the child HTTP request is held open", async () => {
    respond = (response) => response.writeHead(503).end("retry");
    const { delivery } = await createPendingWebhookDelivery(endpointUrl());
    await dispatchWebhookDeliveryById(deliveryTestConnection.db, delivery.id, {
      allowLocalHttp: true,
    });
    await makeDue(delivery.id);

    let releaseResponse: () => void = () => undefined;
    const release = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    let resolveObserved: (rows: (typeof webhookDeliveries.$inferSelect)[]) => void = () =>
      undefined;
    let rejectObserved: (error: unknown) => void = () => undefined;
    const observed = new Promise<(typeof webhookDeliveries.$inferSelect)[]>((resolve, reject) => {
      resolveObserved = resolve;
      rejectObserved = reject;
    });
    respond = (response) => {
      void (async () => {
        try {
          const rows = await deliveryTestConnection.db.transaction((transaction) =>
            transaction
              .select()
              .from(webhookDeliveries)
              .where(eq(webhookDeliveries.retryChainId, delivery.id))
              .orderBy(asc(webhookDeliveries.attempt))
              .for("update"),
          );
          resolveObserved(rows);
          await release;
          response.writeHead(204).end();
        } catch (error) {
          rejectObserved(error);
          response.destroy(error instanceof Error ? error : new Error("Observation failed"));
        }
      })();
    };

    const running = drain(1);
    const rowsDuringRequest = await observed;
    expect(rowsDuringRequest.map(({ result }) => result)).toEqual(["failed", "pending"]);
    expect(rowsDuringRequest[0]?.supersededById).toBe(rowsDuringRequest[1]?.id);
    expect(rowsDuringRequest[1]?.leaseToken).not.toBeNull();
    releaseResponse();
    await expect(running).resolves.toMatchObject({ claimed: 1, finalized: 1, promoted: 1 });
  });
});
