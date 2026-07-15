import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { asc, eq, inArray } from "drizzle-orm";
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
import { claimWebhookDelivery } from "./delivery-store";
import { promoteDueWebhookRetry } from "./retry-ledger";
import { drainWebhookDeliveryQueue } from "./worker";

const originalEncryptionKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
let responseStatus = 204;
let posts = 0;
const server = createServer((request, response) => {
  posts += 1;
  request.resume();
  response.writeHead(responseStatus).end(responseStatus === 204 ? undefined : "retry later");
});

beforeAll(async () => {
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = deliveryTestEncryptionKey.toString("base64url");
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

beforeEach(async () => {
  responseStatus = 204;
  posts = 0;
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
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/worker`;
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

describe("bounded webhook outbox draining with real PostgreSQL and HTTP", () => {
  it("recovers both a never-dispatched root and an expired in-flight root", async () => {
    const first = await createPendingWebhookDelivery(endpointUrl());
    const second = await createPendingWebhookDelivery(endpointUrl());
    const claim = await claimWebhookDelivery(deliveryTestConnection.db, second.delivery.id);
    if (!claim) throw new Error("Expected a claimed delivery");
    await deliveryTestConnection.db
      .update(webhookDeliveries)
      .set({ leaseExpiresAt: new Date(Date.now() - 1_000) })
      .where(eq(webhookDeliveries.id, second.delivery.id));

    const result = await drain(2);
    const rows = await deliveryTestConnection.db
      .select()
      .from(webhookDeliveries)
      .where(inArray(webhookDeliveries.id, [first.delivery.id, second.delivery.id]));

    expect(result).toMatchObject({ claimed: 2, examined: 2, finalized: 2, promoted: 0 });
    expect(rows.map(({ result: state }) => state).sort()).toEqual(["delivered", "delivered"]);
    expect(posts).toBe(2);
  });

  it("skips an active unexpired lease", async () => {
    const { delivery } = await createPendingWebhookDelivery(endpointUrl());
    const claim = await claimWebhookDelivery(deliveryTestConnection.db, delivery.id);
    if (!claim?.leaseToken) throw new Error("Expected a claimed delivery");

    await expect(drain()).resolves.toEqual({
      claimed: 0,
      examined: 0,
      finalized: 0,
      promoted: 0,
    });
    const [stored] = await deliveryTestConnection.db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, delivery.id));
    expect(stored).toMatchObject({ leaseToken: claim.leaseToken, result: "pending" });
    expect(posts).toBe(0);
  });

  it("promotes a due retry, commits its parent, then dispatches the child", async () => {
    responseStatus = 503;
    const { delivery } = await createPendingWebhookDelivery(endpointUrl());
    await dispatchWebhookDeliveryById(deliveryTestConnection.db, delivery.id, {
      allowLocalHttp: true,
    });
    await makeDue(delivery.id);
    responseStatus = 204;

    const result = await drain();
    const chain = await deliveryTestConnection.db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.retryChainId, delivery.id))
      .orderBy(asc(webhookDeliveries.attempt));

    expect(result).toMatchObject({ claimed: 1, finalized: 1, promoted: 1 });
    expect(chain.map(({ result: state }) => state)).toEqual(["failed", "delivered"]);
    expect(chain[0]?.supersededById).toBe(chain[1]?.id);
    expect(posts).toBe(2);
  });

  it("recovers a child left pending after retry promotion committed", async () => {
    responseStatus = 503;
    const { delivery } = await createPendingWebhookDelivery(endpointUrl());
    await dispatchWebhookDeliveryById(deliveryTestConnection.db, delivery.id, {
      allowLocalHttp: true,
    });
    await makeDue(delivery.id);
    const child = await promoteDueWebhookRetry(deliveryTestConnection.db);
    if (!child) throw new Error("Expected a promoted retry");
    responseStatus = 204;

    await expect(drain()).resolves.toMatchObject({ claimed: 1, finalized: 1, promoted: 0 });
    const [stored] = await deliveryTestConnection.db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, child.id));
    expect(stored).toMatchObject({ result: "delivered" });
  });

  it("never exceeds its configured delivery bound", async () => {
    const first = await createPendingWebhookDelivery(endpointUrl());
    const second = await createPendingWebhookDelivery(endpointUrl());

    await expect(drain(1)).resolves.toMatchObject({ claimed: 1, examined: 1, finalized: 1 });
    const rows = await deliveryTestConnection.db
      .select({ id: webhookDeliveries.id, result: webhookDeliveries.result })
      .from(webhookDeliveries)
      .where(inArray(webhookDeliveries.id, [first.delivery.id, second.delivery.id]));
    expect(rows.map(({ result }) => result).sort()).toEqual(["delivered", "pending"]);
    expect(posts).toBe(1);
  });
});
