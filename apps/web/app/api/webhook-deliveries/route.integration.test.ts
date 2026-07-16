import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  closeWebhookDashboardTests,
  createWebhookDashboardSession,
  resetWebhookDashboardTests,
  webhookDashboardConnection,
  webhookDashboardEncryptionKey,
  webhookDashboardHeaders,
  webhookDashboardOrigin,
} from "../../../lib/dashboard/webhooks-test-support";
import { webhookDeliveries } from "../../../lib/db/schema";
import { closeServerDatabase } from "../../../lib/db/server";
import { POST as createEndpoint } from "../webhook-endpoint/route";
import { POST as sendTestWebhook } from "../webhook-endpoint/test/route";
import { POST as resendDelivery } from "./[id]/resend/route";
import { GET } from "./route";

const servers: ReturnType<typeof createServer>[] = [];
const originalEncryptionKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;

async function acceptingServer(onRequest: () => void) {
  const instance = createServer((request, response) => {
    onRequest();
    request.resume();
    response.writeHead(202, { "content-type": "text/plain" }).end("accepted");
  });
  servers.push(instance);
  await new Promise<void>((resolve) => instance.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(instance.address() as AddressInfo).port}/tab`;
}

function request(path: string, method: string, cookie?: string, body?: unknown) {
  return new NextRequest(`${webhookDashboardOrigin}${path}`, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: webhookDashboardHeaders(cookie),
    method,
  });
}

async function provisionDelivery(email: string, url: string) {
  const merchant = await createWebhookDashboardSession(email);
  await createEndpoint(request("/api/webhook-endpoint", "POST", merchant.cookie, { url }));
  const response = await sendTestWebhook(
    request("/api/webhook-endpoint/test", "POST", merchant.cookie),
  );
  const payload = await response.json();
  return { delivery: payload.delivery, merchant };
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

describe("webhook delivery dashboard routes with real PostgreSQL and HTTP", () => {
  it("lists each stored attempt with request, signature, response, and timing evidence", async () => {
    const url = await acceptingServer(() => undefined);
    const first = await provisionDelivery("delivery-list@example.test", url);
    await provisionDelivery("delivery-other@example.test", url);

    const response = await GET(request("/api/webhook-deliveries", "GET", first.merchant.cookie));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.deliveries).toHaveLength(1);
    expect(payload.deliveries[0]).toMatchObject({
      attempt: 1,
      id: first.delivery.id,
      parentDeliveryId: null,
      request: {
        body: expect.stringContaining('"type":"test"'),
        signature: expect.stringMatching(/^t=\d+,v1=[0-9a-f]{64}$/),
      },
      response: { bodySnippet: "accepted", statusCode: 202, timeMs: expect.any(Number) },
      result: "delivered",
      trigger: "manual",
      type: "test",
    });
    expect(payload.deliveries[0].endpointUrl).toBeUndefined();
  });

  it("resends as a new manual root linked to its parent, then dispatches it", async () => {
    let posts = 0;
    const url = await acceptingServer(() => {
      posts += 1;
    });
    const source = await provisionDelivery("delivery-resend@example.test", url);
    const other = await createWebhookDashboardSession("delivery-resend-other@example.test");
    expect(posts).toBe(1);

    const denied = await resendDelivery(
      request(`/api/webhook-deliveries/${source.delivery.id}/resend`, "POST", other.cookie),
      { params: Promise.resolve({ id: source.delivery.id }) },
    );
    expect(denied.status).toBe(404);
    expect(posts).toBe(1);

    const response = await resendDelivery(
      request(
        `/api/webhook-deliveries/${source.delivery.id}/resend`,
        "POST",
        source.merchant.cookie,
      ),
      { params: Promise.resolve({ id: source.delivery.id }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(posts).toBe(2);
    expect(payload.delivery).toMatchObject({
      attempt: 1,
      parentDeliveryId: source.delivery.id,
      result: "delivered",
      trigger: "manual",
    });
    expect(payload.delivery.id).not.toBe(source.delivery.id);
    expect(payload.delivery.retryChainId).toBe(payload.delivery.id);

    const [stored] = await webhookDashboardConnection.db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, payload.delivery.id));
    expect(stored).toMatchObject({
      attempt: 1,
      parentAttempt: null,
      parentDeliveryId: source.delivery.id,
      retryChainId: payload.delivery.id,
      trigger: "manual",
    });
    expect(stored?.requestBody).toBe(source.delivery.requestBody);
    expect(stored?.signatureHeader).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
  });
});
