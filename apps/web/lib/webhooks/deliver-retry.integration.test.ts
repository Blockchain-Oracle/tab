import { createServer } from "node:http";
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
import { promoteDueWebhookRetry } from "./retry-ledger";

const originalEncryptionKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
const server = createServer((request, response) => {
  request.resume();
  response.writeHead(503).end("retry later");
});

beforeAll(async () => {
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = deliveryTestEncryptionKey.toString("base64url");
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

beforeEach(resetDeliveryTests);

afterAll(async () => {
  if (originalEncryptionKey === undefined) delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  else process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = originalEncryptionKey;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await closeDeliveryTests();
});

async function makeDue(id: string) {
  await deliveryTestConnection.db
    .update(webhookDeliveries)
    .set({ nextRetryAt: new Date(Date.now() - 1_000) })
    .where(eq(webhookDeliveries.id, id));
}

function dispatch(id: string) {
  return dispatchWebhookDeliveryById(deliveryTestConnection.db, id, { allowLocalHttp: true });
}

describe("real webhook retry chain", () => {
  it("runs immediate, +1m, and +4m attempts before terminal gave_up", async () => {
    const address = server.address() as AddressInfo;
    const { delivery: root } = await createPendingWebhookDelivery(
      `http://127.0.0.1:${address.port}/retry`,
    );

    await dispatch(root.id);
    const [firstFailure] = await deliveryTestConnection.db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, root.id));
    expect(firstFailure?.nextRetryAt?.getTime()).toBeGreaterThanOrEqual(Date.now() + 59_000);
    await makeDue(root.id);
    const second = await promoteDueWebhookRetry(deliveryTestConnection.db);
    if (!second) throw new Error("Expected attempt two");

    await dispatch(second.id);
    const [secondFailure] = await deliveryTestConnection.db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, second.id));
    expect(secondFailure?.nextRetryAt?.getTime()).toBeGreaterThanOrEqual(Date.now() + 239_000);
    await makeDue(second.id);
    const third = await promoteDueWebhookRetry(deliveryTestConnection.db);
    if (!third) throw new Error("Expected attempt three");
    await dispatch(third.id);

    const chain = await deliveryTestConnection.db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.retryChainId, root.id))
      .orderBy(asc(webhookDeliveries.attempt));
    expect(chain.map(({ result }) => result)).toEqual(["failed", "failed", "gave_up"]);
    expect(new Set(chain.map(({ requestBody }) => requestBody))).toEqual(
      new Set([root.requestBody]),
    );
    expect(new Set(chain.map(({ eventId }) => eventId))).toEqual(new Set([root.eventId]));
    await expect(promoteDueWebhookRetry(deliveryTestConnection.db)).resolves.toBeNull();
  });
});
