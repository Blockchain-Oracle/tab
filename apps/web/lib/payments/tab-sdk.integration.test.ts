import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { Tab } from "../../../../packages/sdk/src/Tab";
import { GET as retrievePayment } from "../../app/api/v1/payments/[id]/route";
import { GET as listPayments } from "../../app/api/v1/payments/route";
import { createSecretApiKey } from "../dashboard/api-keys";
import { createDatabase } from "../db/client";
import { provisionMerchant } from "../db/provision-merchant";
import { apiKeys, payments } from "../db/schema";
import { closeServerDatabase } from "../db/server";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for the Tab SDK integration test");

const connection = createDatabase(databaseUrl, 1);

async function close(server: ReturnType<typeof createServer>) {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

async function apiServer() {
  const server = createServer(async (incoming, outgoing) => {
    const address = server.address() as AddressInfo;
    const url = new URL(incoming.url ?? "/", `http://127.0.0.1:${address.port}`);
    const request = new NextRequest(url, {
      headers: incoming.headers.authorization
        ? { authorization: incoming.headers.authorization }
        : {},
    });
    const id = url.pathname.startsWith("/api/v1/payments/")
      ? url.pathname.slice("/api/v1/payments/".length)
      : undefined;
    const response = id
      ? await retrievePayment(request, { params: Promise.resolve({ id }) })
      : await listPayments(request);
    outgoing.statusCode = response.status;
    response.headers.forEach((value, name) => {
      outgoing.setHeader(name, value);
    });
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    server,
  };
}

describe("published Tab client against the real secret-key API and PostgreSQL", () => {
  beforeEach(async () => {
    await connection.client`truncate table users cascade`;
  });

  afterAll(async () => {
    await closeServerDatabase();
    await connection.client.end();
  });

  it("lists and retrieves only the key tenant's payment over HTTP", async () => {
    const identity = await provisionMerchant(connection.db, {
      email: `tab-sdk-${randomUUID()}@example.test`,
      magicIssuer: `did:ethr:${randomUUID()}`,
      receivingAddress: "0x1111111111111111111111111111111111111111",
    });
    const key = await createSecretApiKey(connection.db, {
      env: "test",
      merchantId: identity.merchantId,
      name: "SDK integration",
      permissions: "read_only",
    });
    const [payment] = await connection.db
      .insert(payments)
      .values({
        amountUsd: "2.500000",
        currency: "USD",
        env: "test",
        intentUrl: "https://merchant.example.test/intent",
        livemode: false,
        merchantId: identity.merchantId,
        refCode: `TAB-${randomUUID().slice(0, 8).toUpperCase()}`,
        receiver: "0x1111111111111111111111111111111111111111",
        tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        tokenChainId: 42161,
      })
      .returning({ id: payments.id });
    if (!payment) throw new Error("Expected a payment row");

    const api = await apiServer();
    const originalBaseUrl = process.env.TAB_API_BASE_URL;
    process.env.TAB_API_BASE_URL = api.baseUrl;
    try {
      const tab = new Tab(key.secret);
      await expect(tab.payments.list({ limit: 1 })).resolves.toMatchObject([
        { amount: "2.500000", env: "test", id: payment.id },
      ]);
      await expect(tab.payments.retrieve(payment.id)).resolves.toMatchObject({ id: payment.id });
    } finally {
      if (originalBaseUrl === undefined) delete process.env.TAB_API_BASE_URL;
      else process.env.TAB_API_BASE_URL = originalBaseUrl;
      await close(api.server);
    }

    const [stored] = await connection.db
      .select({ lastUsedAt: apiKeys.lastUsedAt })
      .from(apiKeys)
      .where(eq(apiKeys.id, key.key.id));
    expect(stored?.lastUsedAt).toBeInstanceOf(Date);
  });
});
