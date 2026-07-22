import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { hashApiKey } from "../../../../lib/auth/api-key";
import { createDatabase } from "../../../../lib/db/client";
import { provisionMerchant } from "../../../../lib/db/provision-merchant";
import { apiKeys } from "../../../../lib/db/schema";
import { closeServerDatabase } from "../../../../lib/db/server";
import { DELETE, GET, PATCH, POST } from "./route";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for webhook route tests");

const connection = createDatabase(databaseUrl, 1);
const encryptionKey = Buffer.alloc(32, 7).toString("base64url");
const originalEncryptionKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;

async function merchant() {
  return provisionMerchant(connection.db, {
    email: `hook-${randomUUID()}@example.test`,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x1111111111111111111111111111111111111111",
  });
}

async function secretKey(merchantId: string, permissions: "full" | "read_only" = "full") {
  const rawKey = `sk_test_${randomUUID().replaceAll("-", "")}`;
  await connection.db.insert(apiKeys).values({
    env: "test",
    last4: rawKey.slice(-4),
    merchantId,
    name: "Webhook route key",
    permissions,
    prefix: "sk_test_",
    secretHash: hashApiKey(rawKey),
    type: "secret",
  });
  return rawKey;
}

function request(method: string, key?: string, body?: unknown) {
  return new NextRequest("http://localhost/api/v1/webhook-endpoint", {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      "content-type": "application/json",
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    method,
  });
}

describe("v1 webhook endpoint API (secret key)", () => {
  beforeEach(async () => {
    process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = encryptionKey;
    await connection.client`
      truncate table webhook_deliveries, webhook_endpoints, api_keys, merchants, users cascade
    `;
  });

  afterAll(async () => {
    if (originalEncryptionKey === undefined) {
      delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
    } else {
      process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = originalEncryptionKey;
    }
    await closeServerDatabase();
    await connection.client.end();
  });

  it("rejects requests without a key", async () => {
    const response = await GET(request("GET"));
    expect(response.status).toBe(401);
  });

  it("creates, reads, updates, and deletes the endpoint with manage permission", async () => {
    const owner = await merchant();
    const key = await secretKey(owner.merchantId);

    const created = await POST(
      request("POST", key, { url: "https://merchant.example.test/hooks" }),
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      endpoint: { url: string };
      secret: string;
    };
    expect(createdBody.secret.startsWith("whsec_")).toBe(true);
    expect(createdBody.endpoint.url).toBe("https://merchant.example.test/hooks");

    const read = await GET(request("GET", key));
    expect(read.status).toBe(200);
    const readBody = (await read.json()) as { endpoint: { url: string; secretLast4: string } };
    expect(readBody.endpoint.url).toBe("https://merchant.example.test/hooks");
    // The signing secret is never re-shown after creation.
    expect(JSON.stringify(readBody)).not.toContain(createdBody.secret);

    const updated = await PATCH(
      request("PATCH", key, { url: "https://merchant.example.test/hooks2" }),
    );
    expect(updated.status).toBe(200);

    const removed = await DELETE(request("DELETE", key));
    expect(removed.status).toBe(204);

    const afterDelete = await GET(request("GET", key));
    expect(((await afterDelete.json()) as { endpoint: unknown }).endpoint).toBeNull();
  });

  it("refuses mutations for read-only keys but allows reads", async () => {
    const owner = await merchant();
    const key = await secretKey(owner.merchantId, "read_only");

    const created = await POST(
      request("POST", key, { url: "https://merchant.example.test/hooks" }),
    );
    expect(created.status).toBe(403);

    const read = await GET(request("GET", key));
    expect(read.status).toBe(200);
  });
});
