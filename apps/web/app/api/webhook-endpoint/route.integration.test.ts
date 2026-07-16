import { createHmac } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { and, eq, isNull } from "drizzle-orm";
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
import { webhookDeliveries, webhookEndpoints } from "../../../lib/db/schema";
import { closeServerDatabase } from "../../../lib/db/server";
import { decryptWebhookSecret } from "../../../lib/webhooks/secret-crypto";
import { POST as regenerateSecret } from "./regenerate/route";
import { DELETE, GET, PATCH, POST } from "./route";
import { POST as sendTestWebhook } from "./test/route";

const servers: ReturnType<typeof createServer>[] = [];
const originalEncryptionKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;

async function server(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const instance = createServer(handler);
  servers.push(instance);
  await new Promise<void>((resolve) => instance.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(instance.address() as AddressInfo).port}`;
}

function request(
  path: string,
  method: string,
  cookie?: string,
  body?: unknown,
  origin = webhookDashboardOrigin,
) {
  return new NextRequest(`${webhookDashboardOrigin}${path}`, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: webhookDashboardHeaders(cookie, origin),
    method,
  });
}

async function activeEndpoint(merchantId: string, env: "live" | "test" = "test") {
  const [row] = await webhookDashboardConnection.db
    .select()
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.merchantId, merchantId),
        eq(webhookEndpoints.env, env),
        isNull(webhookEndpoints.deletedAt),
      ),
    );
  return row;
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

describe("webhook endpoint dashboard routes with real PostgreSQL and HTTP", () => {
  it("requires the signed session and same-origin mutation", async () => {
    const merchant = await createWebhookDashboardSession("webhook-auth@example.test");
    const url = "https://hooks.example.test/tab";

    expect((await POST(request("/api/webhook-endpoint", "POST", undefined, { url }))).status).toBe(
      401,
    );
    expect(
      (
        await POST(
          request(
            "/api/webhook-endpoint",
            "POST",
            merchant.cookie,
            { url },
            "https://attacker.example",
          ),
        )
      ).status,
    ).toBe(403);
    await expect(activeEndpoint(merchant.merchantId)).resolves.toBeUndefined();
  });

  it("creates one env-scoped endpoint and reveals an AES-GCM secret exactly once", async () => {
    const merchant = await createWebhookDashboardSession("webhook-create@example.test");
    const response = await POST(
      request("/api/webhook-endpoint", "POST", merchant.cookie, {
        url: "https://hooks.example.test/tab",
      }),
    );
    const created = await response.json();

    expect(response.status).toBe(201);
    expect(created.secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(created.endpoint).toMatchObject({
      env: "test",
      listening: false,
      secretLast4: created.secret.slice(-4),
      url: "https://hooks.example.test/tab",
      verifiedAt: null,
    });

    const stored = await activeEndpoint(merchant.merchantId);
    expect(stored?.secretCiphertext).not.toContain(created.secret);
    expect(
      decryptWebhookSecret(
        {
          authTag: stored?.secretAuthTag ?? "",
          ciphertext: stored?.secretCiphertext ?? "",
          keyVersion: stored?.secretKeyVersion ?? 0,
          nonce: stored?.secretNonce ?? "",
        },
        {
          endpointId: stored?.id ?? "",
          env: "test",
          keyVersion: stored?.secretKeyVersion ?? 0,
          merchantId: merchant.merchantId,
        },
        webhookDashboardEncryptionKey,
      ),
    ).toBe(created.secret);

    const read = await GET(request("/api/webhook-endpoint", "GET", merchant.cookie));
    const readPayload = await read.json();
    expect(readPayload.endpoint).toMatchObject({
      id: stored?.id,
      secretLast4: created.secret.slice(-4),
    });
    expect(readPayload.secret).toBeUndefined();

    const duplicate = await POST(
      request("/api/webhook-endpoint", "POST", merchant.cookie, {
        url: "https://second.example.test/tab",
      }),
    );
    expect(duplicate.status).toBe(409);

    const liveToken = await import("../../../lib/auth/session").then(({ createSessionToken }) =>
      createSessionToken({
        email: "webhook-create@example.test",
        merchantId: merchant.merchantId,
        mode: "live",
        userId: merchant.userId,
      }),
    );
    const live = await GET(request("/api/webhook-endpoint", "GET", `tab_session=${liveToken}`));
    await expect(live.json()).resolves.toEqual({ endpoint: null });
  });

  it("updates the URL, regenerates the secret, and soft-deletes encrypted material", async () => {
    const merchant = await createWebhookDashboardSession("webhook-lifecycle@example.test");
    const createdResponse = await POST(
      request("/api/webhook-endpoint", "POST", merchant.cookie, {
        url: "https://hooks.example.test/original",
      }),
    );
    const created = await createdResponse.json();

    const patched = await PATCH(
      request("/api/webhook-endpoint", "PATCH", merchant.cookie, {
        url: "https://hooks.example.test/updated",
      }),
    );
    expect(patched.status).toBe(200);
    await expect(patched.json()).resolves.toMatchObject({
      endpoint: { url: "https://hooks.example.test/updated", verifiedAt: null },
    });

    const regenerated = await regenerateSecret(
      request("/api/webhook-endpoint/regenerate", "POST", merchant.cookie),
    );
    const rotated = await regenerated.json();
    expect(regenerated.status).toBe(200);
    expect(rotated.secret).toMatch(/^whsec_/);
    expect(rotated.secret).not.toBe(created.secret);
    expect(rotated.endpoint.secretLast4).toBe(rotated.secret.slice(-4));

    const deleted = await DELETE(request("/api/webhook-endpoint", "DELETE", merchant.cookie));
    expect(deleted.status).toBe(204);
    await expect(activeEndpoint(merchant.merchantId)).resolves.toBeUndefined();
    const [tombstone] = await webhookDashboardConnection.db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.merchantId, merchant.merchantId));
    expect(tombstone).toMatchObject({
      secretAuthTag: null,
      secretCiphertext: null,
      secretKeyVersion: null,
      secretNonce: null,
    });
    expect(tombstone?.deletedAt).toBeInstanceOf(Date);
  });

  it("sends an honestly labeled signed test request and verifies only on 2xx", async () => {
    const received: Array<{ body: string; signature: string }> = [];
    const successUrl = await server((incoming, response) => {
      let body = "";
      incoming.setEncoding("utf8");
      incoming.on("data", (chunk) => (body += chunk));
      incoming.on("end", () => {
        received.push({ body, signature: String(incoming.headers["x-tab-signature"]) });
        response.writeHead(204).end();
      });
    });
    const merchant = await createWebhookDashboardSession("webhook-test@example.test");
    const created = await POST(
      request("/api/webhook-endpoint", "POST", merchant.cookie, { url: `${successUrl}/tab` }),
    ).then((response) => response.json());

    const sent = await sendTestWebhook(
      request("/api/webhook-endpoint/test", "POST", merchant.cookie),
    );
    const payload = await sent.json();
    expect(sent.status).toBe(200);
    expect(payload.delivery).toMatchObject({ result: "delivered", statusCode: 204, type: "test" });
    expect(payload.endpoint.listening).toBe(true);
    expect(payload.endpoint.verifiedAt).toEqual(expect.any(String));
    expect(received).toHaveLength(1);

    const parsed = JSON.parse(received[0]?.body ?? "{}");
    expect(parsed).toMatchObject({ livemode: false, type: "test" });
    expect(parsed.transactionId).toBeUndefined();
    expect(parsed.tokenChanges).toBeUndefined();
    const timestamp = Number(/^t=(\d+),/.exec(received[0]?.signature ?? "")?.[1]);
    const expected = createHmac("sha256", created.secret)
      .update(`${timestamp}.${received[0]?.body}`)
      .digest("hex");
    expect(received[0]?.signature).toBe(`t=${timestamp},v1=${expected}`);

    const [delivery] = await webhookDashboardConnection.db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, payload.delivery.id));
    expect(delivery).toMatchObject({
      paymentId: null,
      result: "delivered",
      settlementId: null,
      trigger: "manual",
      type: "test",
    });
    expect(delivery?.requestBody).toBe(received[0]?.body);
    expect(delivery?.signatureHeader).toBe(received[0]?.signature);
    expect(delivery?.responseTimeMs).toEqual(expect.any(Number));

    const failureUrl = await server((incoming, response) => {
      incoming.resume();
      response.writeHead(500).end("not listening");
    });
    const second = await createWebhookDashboardSession("webhook-test-failure@example.test");
    await POST(
      request("/api/webhook-endpoint", "POST", second.cookie, { url: `${failureUrl}/tab` }),
    );
    const failed = await sendTestWebhook(
      request("/api/webhook-endpoint/test", "POST", second.cookie),
    );
    const failedPayload = await failed.json();
    expect(failedPayload.delivery).toMatchObject({ result: "retrying", statusCode: 500 });
    expect(failedPayload.endpoint).toMatchObject({ listening: false, verifiedAt: null });
    expect((await activeEndpoint(second.merchantId))?.verifiedAt).toBeNull();
  });
});
