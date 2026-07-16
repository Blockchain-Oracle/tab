import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { webhookDeliveries, webhookEndpoints } from "../db/schema";
import { closeServerDatabase } from "../db/server";
import { dispatchWebhookDeliveryById } from "../webhooks/deliver";
import { promoteDueWebhookRetry } from "../webhooks/retry-ledger";
import { sendDashboardTestWebhook } from "./webhooks-deliveries";
import {
  createWebhookEndpoint,
  readWebhookEndpoint,
  regenerateWebhookSecret,
} from "./webhooks-endpoints";
import {
  closeWebhookDashboardTests,
  createWebhookDashboardSession,
  resetWebhookDashboardTests,
  webhookDashboardConnection,
  webhookDashboardEncryptionKey,
} from "./webhooks-test-support";

const servers: ReturnType<typeof createServer>[] = [];
const originalEncryptionKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;

async function server(handler: (response: ServerResponse) => void) {
  const instance = createServer((request, response) => {
    request.resume();
    request.on("end", () => handler(response));
  });
  servers.push(instance);
  await new Promise<void>((resolve) => instance.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(instance.address() as AddressInfo).port}/tab`;
}

async function endpointVerifiedAt(merchantId: string) {
  const [endpoint] = await webhookDashboardConnection.db
    .select({ verifiedAt: webhookEndpoints.verifiedAt })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.merchantId, merchantId));
  return endpoint?.verifiedAt ?? null;
}

beforeEach(async () => {
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = webhookDashboardEncryptionKey.toString("base64url");
  await resetWebhookDashboardTests();
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
  await closeServerDatabase();
  await closeWebhookDashboardTests();
});

describe("test webhook verification across the real retry dispatcher", () => {
  it("sets verified_at when a later automatic retry returns 2xx", async () => {
    let succeeds = false;
    const url = await server((response) => {
      response.writeHead(succeeds ? 204 : 500).end();
    });
    const merchant = await createWebhookDashboardSession("retry-verification@example.test");
    const principal = { env: "test", merchantId: merchant.merchantId } as const;
    await createWebhookEndpoint(webhookDashboardConnection.db, principal, url, {
      allowLocalHttp: true,
    });

    const first = await sendDashboardTestWebhook(webhookDashboardConnection.db, principal, {
      allowLocalHttp: true,
    });
    expect(first.delivery.result).toBe("retrying");
    await webhookDashboardConnection.db
      .update(webhookDeliveries)
      .set({ nextRetryAt: new Date(0) })
      .where(eq(webhookDeliveries.id, first.delivery.id));

    const retry = await promoteDueWebhookRetry(webhookDashboardConnection.db);
    if (!retry) throw new Error("Expected a promoted retry");
    succeeds = true;
    await dispatchWebhookDeliveryById(webhookDashboardConnection.db, retry.id, {
      allowLocalHttp: true,
    });

    await expect(endpointVerifiedAt(merchant.merchantId)).resolves.toBeInstanceOf(Date);
  });

  it("does not verify a configuration whose secret changed while the request was in flight", async () => {
    let requestReceived: () => void = () => undefined;
    const received = new Promise<void>((resolve) => {
      requestReceived = resolve;
    });
    let releaseResponse: () => void = () => undefined;
    const release = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const url = await server((response) => {
      requestReceived();
      void release.then(() => response.writeHead(204).end());
    });
    const merchant = await createWebhookDashboardSession("stale-verification@example.test");
    const principal = { env: "test", merchantId: merchant.merchantId } as const;
    await createWebhookEndpoint(webhookDashboardConnection.db, principal, url, {
      allowLocalHttp: true,
    });

    const dispatch = sendDashboardTestWebhook(webhookDashboardConnection.db, principal, {
      allowLocalHttp: true,
    });
    await received;
    await regenerateWebhookSecret(webhookDashboardConnection.db, principal);
    releaseResponse();
    await expect(dispatch).resolves.toMatchObject({ delivery: { result: "delivered" } });

    await expect(endpointVerifiedAt(merchant.merchantId)).resolves.toBeNull();
    await expect(
      readWebhookEndpoint(webhookDashboardConnection.db, principal),
    ).resolves.toMatchObject({
      lastDeliveredAt: null,
      listening: false,
    });
  });

  it("changes current endpoint health from listening to failing after the latest chain gives up", async () => {
    let succeeds = true;
    const url = await server((response) => {
      response.writeHead(succeeds ? 204 : 500).end();
    });
    const merchant = await createWebhookDashboardSession("current-health@example.test");
    const principal = { env: "test", merchantId: merchant.merchantId } as const;
    await createWebhookEndpoint(webhookDashboardConnection.db, principal, url, {
      allowLocalHttp: true,
    });

    await sendDashboardTestWebhook(webhookDashboardConnection.db, principal, {
      allowLocalHttp: true,
    });
    await expect(
      readWebhookEndpoint(webhookDashboardConnection.db, principal),
    ).resolves.toMatchObject({ health: "listening", listening: true });

    succeeds = false;
    let delivery = await sendDashboardTestWebhook(webhookDashboardConnection.db, principal, {
      allowLocalHttp: true,
    });
    for (let attempt = 2; attempt <= 3; attempt += 1) {
      await webhookDashboardConnection.db
        .update(webhookDeliveries)
        .set({ nextRetryAt: new Date(0) })
        .where(eq(webhookDeliveries.id, delivery.delivery.id));
      const retry = await promoteDueWebhookRetry(webhookDashboardConnection.db);
      if (!retry) throw new Error(`Expected retry attempt ${attempt}`);
      await dispatchWebhookDeliveryById(webhookDashboardConnection.db, retry.id, {
        allowLocalHttp: true,
      });
      const [stored] = await webhookDashboardConnection.db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.id, retry.id));
      if (!stored) throw new Error("Expected the retry row");
      delivery = { ...delivery, delivery: stored };
    }

    expect(delivery.delivery.result).toBe("gave_up");
    await expect(
      readWebhookEndpoint(webhookDashboardConnection.db, principal),
    ).resolves.toMatchObject({ health: "failing", listening: false });
  });
});
