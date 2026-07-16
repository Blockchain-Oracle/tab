import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as resendDelivery } from "../../app/api/webhook-deliveries/[id]/resend/route";
import { POST as sendTestWebhook } from "../../app/api/webhook-endpoint/test/route";
import { closeServerDatabase } from "../db/server";
import { createWebhookEndpoint } from "./webhooks-endpoints";
import { MANUAL_WEBHOOK_RATE_LIMIT } from "./webhooks-manual-limit";
import {
  closeWebhookDashboardTests,
  createWebhookDashboardSession,
  resetWebhookDashboardTests,
  webhookDashboardConnection,
  webhookDashboardEncryptionKey,
  webhookDashboardHeaders,
  webhookDashboardOrigin,
} from "./webhooks-test-support";

const servers: ReturnType<typeof createServer>[] = [];
const originalEncryptionKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;

async function receiver(handler: () => Promise<void> | void) {
  const server = createServer((request, response) => {
    request.resume();
    request.on(
      "end",
      () => void Promise.resolve(handler()).then(() => response.writeHead(204).end()),
    );
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/tab`;
}

function request(path: string, cookie: string) {
  return new NextRequest(`${webhookDashboardOrigin}${path}`, {
    headers: webhookDashboardHeaders(cookie),
    method: "POST",
  });
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
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
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

describe("manual webhook egress limits with real PostgreSQL and HTTP", () => {
  it("shares one durable rate window across test sends and resends", async () => {
    let requests = 0;
    const url = await receiver(() => {
      requests += 1;
    });
    const merchant = await createWebhookDashboardSession("webhook-rate@example.test");
    await createWebhookEndpoint(
      webhookDashboardConnection.db,
      { env: "test", merchantId: merchant.merchantId },
      url,
      { allowLocalHttp: true },
    );

    let sourceId = "";
    for (let count = 0; count < MANUAL_WEBHOOK_RATE_LIMIT; count += 1) {
      const response = await sendTestWebhook(
        request("/api/webhook-endpoint/test", merchant.cookie),
      );
      expect(response.status).toBe(200);
      if (!sourceId) sourceId = (await response.json()).delivery.id;
    }

    const blocked = await resendDelivery(
      request(`/api/webhook-deliveries/${sourceId}/resend`, merchant.cookie),
      { params: Promise.resolve({ id: sourceId }) },
    );
    expect(blocked.status).toBe(429);
    await expect(blocked.json()).resolves.toMatchObject({
      error: { code: "WEBHOOK_RATE_LIMITED" },
    });
    expect(requests).toBe(MANUAL_WEBHOOK_RATE_LIMIT);
  });

  it("allows only two concurrent manual dispatches per environment", async () => {
    let requests = 0;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let receivedTwo!: () => void;
    const twoRequests = new Promise<void>((resolve) => {
      receivedTwo = resolve;
    });
    const url = await receiver(async () => {
      requests += 1;
      if (requests === 2) receivedTwo();
      await held;
    });
    const merchant = await createWebhookDashboardSession("webhook-concurrency@example.test");
    await createWebhookEndpoint(
      webhookDashboardConnection.db,
      { env: "test", merchantId: merchant.merchantId },
      url,
      { allowLocalHttp: true },
    );

    const first = sendTestWebhook(request("/api/webhook-endpoint/test", merchant.cookie));
    const second = sendTestWebhook(request("/api/webhook-endpoint/test", merchant.cookie));
    await twoRequests;
    const blocked = await sendTestWebhook(request("/api/webhook-endpoint/test", merchant.cookie));

    expect(blocked.status).toBe(429);
    expect(requests).toBe(2);
    release();
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ status: 200 }),
      expect.objectContaining({ status: 200 }),
    ]);
  });
});
