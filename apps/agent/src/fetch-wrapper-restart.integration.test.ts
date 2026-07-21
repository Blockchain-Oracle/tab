import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTabFetch } from "./fetch-wrapper.js";

const payerAccount = privateKeyToAccount(`0x${"11".repeat(32)}`);
const payer = payerAccount.address;
const transaction = `0x${"cd".repeat(32)}`;
const paymentRequired = {
  accepts: [
    {
      amount: "25000",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      extra: { name: "USD Coin", version: "2" },
      maxTimeoutSeconds: 60,
      network: "eip155:8453",
      payTo: "0x1111111111111111111111111111111111111111",
      scheme: "exact",
    },
  ],
  resource: { url: "http://127.0.0.1/ambiguous" },
  x402Version: 2,
} satisfies PaymentRequired;

async function requestBody(request: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

describe("durable payment authorization restart recovery", () => {
  const paymentHeaders: string[] = [];
  const reconciliationBodies: unknown[] = [];
  const signRequests: unknown[] = [];
  let origin = "";
  let stateDirectory = "";
  let durableNow = 0;
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://loopback").pathname;
    if (pathname === "/api/agent/sign") {
      const body = await requestBody(request);
      signRequests.push(body);
      const signature = await payerAccount.signTypedData(body.signerRequest);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ receiptId: "receipt-1", signature }));
      return;
    }
    if (pathname === "/api/agent/pay/result") {
      await requestBody(request);
      response.statusCode = 204;
      response.end();
      return;
    }
    if (pathname === "/api/agent/pay/reconcile") {
      const body = await requestBody(request);
      reconciliationBodies.push(body);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ receiptId: body.receiptId, status: "failed", verified: true }));
      return;
    }
    if (pathname === "/ambiguous") {
      const paymentHeader = request.headers["payment-signature"];
      if (typeof paymentHeader !== "string") {
        response.statusCode = 402;
        response.setHeader("PAYMENT-REQUIRED", encodePaymentRequiredHeader(paymentRequired));
        response.end("payment required");
        return;
      }
      paymentHeaders.push(paymentHeader);
      if (paymentHeaders.length === 1) {
        response.socket?.destroy();
        return;
      }
      response.setHeader(
        "PAYMENT-RESPONSE",
        encodePaymentResponseHeader({
          network: "eip155:8453",
          payer,
          success: true,
          transaction,
        }),
      );
      response.end("recovered result");
      return;
    }
    response.statusCode = 404;
    response.end();
  });

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP listener");
    origin = `http://127.0.0.1:${address.port}`;
    paymentRequired.resource.url = `${origin}/ambiguous`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  beforeEach(async () => {
    paymentHeaders.length = 0;
    reconciliationBodies.length = 0;
    signRequests.length = 0;
    durableNow = Math.floor(Date.now() / 1_000);
    stateDirectory = await mkdtemp(join(tmpdir(), "tab-payment-restart-"));
  });

  afterEach(async () => {
    await rm(stateDirectory, { force: true, recursive: true });
  });

  it("replays one exact authorization after response loss and process restart", async () => {
    let key = "ambiguous-payment-1";
    const options = {
      address: payer,
      allowDevelopmentLoopback: true,
      apiBaseUrl: origin,
      apiKey: "agent_sk_integration",
      fetch: globalThis.fetch,
      idempotencyKey: () => key,
      nowSeconds: () => durableNow,
      paymentProfile: "mainnet" as const,
      paymentStateDirectory: stateDirectory,
    };

    await expect(createTabFetch(options)(`${origin}/ambiguous`)).rejects.toThrow();
    expect(signRequests).toHaveLength(1);
    expect(paymentHeaders).toHaveLength(1);

    key = "different-payment";
    const restartedProcess = createTabFetch(options);
    await expect(restartedProcess(`${origin}/ambiguous`)).rejects.toMatchObject({
      code: "PAYMENT_RECONCILIATION_REQUIRED",
    });
    expect(signRequests).toHaveLength(1);

    key = "ambiguous-payment-1";
    await expect((await restartedProcess(`${origin}/ambiguous`)).text()).resolves.toBe(
      "recovered result",
    );
    await expect((await createTabFetch(options)(`${origin}/ambiguous`)).text()).resolves.toBe(
      "recovered result",
    );
    expect(signRequests).toHaveLength(1);
    expect(paymentHeaders).toHaveLength(3);
    expect(new Set(paymentHeaders).size).toBe(1);
  });

  it("does not sign a 402 without an explicit payment idempotency key", async () => {
    const leashFetch = createTabFetch({
      address: payer,
      allowDevelopmentLoopback: true,
      apiBaseUrl: origin,
      apiKey: "agent_sk_integration",
      fetch: globalThis.fetch,
      paymentProfile: "mainnet",
      paymentStateDirectory: stateDirectory,
    });

    await expect(leashFetch(`${origin}/ambiguous`)).rejects.toMatchObject({
      code: "PAYMENT_IDEMPOTENCY_KEY_REQUIRED",
    });
    expect(signRequests).toHaveLength(0);
    expect(paymentHeaders).toHaveLength(0);
  });

  it("replaces an expired authorization only after chain proof that it is unused", async () => {
    let resetClock = false;
    const authorizationState = async () => {
      resetClock = true;
      durableNow = Math.floor(Date.now() / 1_000);
      return "unused" as const;
    };
    const options = {
      address: payer,
      allowDevelopmentLoopback: true,
      apiBaseUrl: origin,
      apiKey: "agent_sk_integration",
      authorizationState,
      fetch: globalThis.fetch,
      idempotencyKey: () => "expired-unused",
      nowSeconds: () => durableNow,
      paymentProfile: "mainnet" as const,
      paymentStateDirectory: stateDirectory,
    };

    await expect(createTabFetch(options)(`${origin}/ambiguous`)).rejects.toThrow();
    const expiredHeader = paymentHeaders[0];
    durableNow += 1_000;
    const recovered = await createTabFetch(options)(`${origin}/ambiguous`);

    await expect(recovered.text()).resolves.toBe("recovered result");
    expect(resetClock).toBe(true);
    expect(reconciliationBodies).toEqual([{ receiptId: "receipt-1" }]);
    expect(signRequests).toHaveLength(2);
    expect(paymentHeaders).toHaveLength(2);
    expect(paymentHeaders[1]).not.toBe(expiredHeader);
  });

  it("replays an expired authorization that chain state proves was used", async () => {
    const options = {
      address: payer,
      allowDevelopmentLoopback: true,
      apiBaseUrl: origin,
      apiKey: "agent_sk_integration",
      authorizationState: async () => "used" as const,
      fetch: globalThis.fetch,
      idempotencyKey: () => "expired-used",
      nowSeconds: () => durableNow,
      paymentProfile: "mainnet" as const,
      paymentStateDirectory: stateDirectory,
    };

    await expect(createTabFetch(options)(`${origin}/ambiguous`)).rejects.toThrow();
    durableNow += 1_000;
    const recovered = await createTabFetch(options)(`${origin}/ambiguous`);

    await expect(recovered.text()).resolves.toBe("recovered result");
    expect(signRequests).toHaveLength(1);
    expect(paymentHeaders).toHaveLength(2);
    expect(paymentHeaders[1]).toBe(paymentHeaders[0]);
  });

  it("fails closed when expired authorization chain state is unavailable", async () => {
    const options = {
      address: payer,
      allowDevelopmentLoopback: true,
      apiBaseUrl: origin,
      apiKey: "agent_sk_integration",
      authorizationState: async () => {
        throw new Error("rpc unavailable");
      },
      fetch: globalThis.fetch,
      idempotencyKey: () => "expired-unresolved",
      nowSeconds: () => durableNow,
      paymentProfile: "mainnet" as const,
      paymentStateDirectory: stateDirectory,
    };

    await expect(createTabFetch(options)(`${origin}/ambiguous`)).rejects.toThrow();
    durableNow += 1_000;
    await expect(createTabFetch(options)(`${origin}/ambiguous`)).rejects.toMatchObject({
      code: "PAYMENT_ENVELOPE_CHAIN_STATE_UNRESOLVED",
    });
    expect(signRequests).toHaveLength(1);
    expect(paymentHeaders).toHaveLength(1);
  });
});
