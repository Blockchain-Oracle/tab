import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

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
  resource: { url: "http://127.0.0.1/protected" },
  x402Version: 2,
} satisfies PaymentRequired;
const testnetPaymentRequired = {
  accepts: [
    {
      amount: "25000",
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      extra: { name: "USDC", version: "2" },
      maxTimeoutSeconds: 60,
      network: "eip155:84532",
      payTo: "0x1111111111111111111111111111111111111111",
      scheme: "exact",
    },
  ],
  resource: { url: "http://127.0.0.1/protected-testnet" },
  x402Version: 2,
} satisfies PaymentRequired;
async function jsonRequest(request: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function textRequest(request: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

describe("Agent fetch wrapper with real x402 and HTTP wires", () => {
  const signRequests: unknown[] = [];
  const signatures: `0x${string}`[] = [];
  const resultRequests: unknown[] = [];
  const protectedRequestBodies: string[] = [];
  let stateDirectory = "";
  let origin = "";
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://loopback").pathname;
    if (pathname === "/api/agent/sign") {
      expect(request.headers.authorization).toBe("Bearer agent_sk_integration");
      const body = await jsonRequest(request);
      signRequests.push(body);
      const signature = await payerAccount.signTypedData(body.signerRequest);
      signatures.push(signature);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ receiptId: "receipt-1", signature }));
      return;
    }
    if (pathname === "/api/agent/pay/result") {
      const body = await jsonRequest(request);
      resultRequests.push(body);
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({ receiptId: body.receiptId, status: "settled", verified: true }),
      );
      return;
    }
    if (pathname === "/protected" || pathname === "/protected-testnet") {
      protectedRequestBodies.push(await textRequest(request));
      const paymentHeader = request.headers["payment-signature"];
      const testnet = pathname === "/protected-testnet";
      const required = testnet ? testnetPaymentRequired : paymentRequired;
      const network = testnet ? "eip155:84532" : "eip155:8453";
      if (typeof paymentHeader !== "string") {
        response.statusCode = 402;
        response.setHeader("PAYMENT-REQUIRED", encodePaymentRequiredHeader(required));
        response.end("payment required");
        return;
      }
      const payload = decodePaymentSignatureHeader(paymentHeader);
      expect(payload).toMatchObject({
        accepted: { network },
        payload: { signature: signatures.at(-1) },
      });
      response.setHeader(
        "PAYMENT-RESPONSE",
        encodePaymentResponseHeader({
          network,
          payer,
          success: true,
          transaction,
        }),
      );
      response.end("protected result");
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
    stateDirectory = await mkdtemp(join(tmpdir(), "tab-payment-state-"));
    paymentRequired.resource.url = `${origin}/protected`;
    testnetPaymentRequired.resource.url = `${origin}/protected-testnet`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(stateDirectory, { force: true, recursive: true });
  });

  beforeEach(() => {
    signRequests.length = 0;
    signatures.length = 0;
    resultRequests.length = 0;
    protectedRequestBodies.length = 0;
  });

  it("pays, retries, reports settlement, and redacts receipt-origin secrets", async () => {
    const leashFetch = createTabFetch({
      address: payer,
      allowDevelopmentLoopback: true,
      apiBaseUrl: origin,
      apiKey: "agent_sk_integration",
      fetch: globalThis.fetch,
      idempotencyKey: () => "mainnet-get-1",
      paymentProfile: "mainnet",
      paymentStateDirectory: stateDirectory,
    });

    const response = await leashFetch(`${origin}/protected?api_key=receipt-secret#client-fragment`);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("protected result");
    expect(signRequests).toHaveLength(1);
    expect(signRequests[0]).toMatchObject({
      amount: "25000",
      network: "eip155:8453",
      origin: {
        clientName: "leash-fetch",
        toolName: `GET ${origin}/protected`,
        transport: "http",
      },
      resourceUrl: `${origin}/protected`,
    });
    expect(JSON.stringify(signRequests[0])).not.toMatch(/receipt-secret|client-fragment/);
    await expect
      .poll(() => resultRequests, { timeout: 1_000 })
      .toEqual([
        {
          outcome: "observed",
          paymentResponse: {
            network: "eip155:8453",
            payer,
            success: true,
            transaction,
          },
          receiptId: "receipt-1",
        },
      ]);
  });

  it("preserves a POST Request body across metadata extraction and the paid retry", async () => {
    const body = JSON.stringify({ prompt: "charge this exact request" });
    const request = new Request(`${origin}/protected`, {
      body,
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const fetchBodyStates: boolean[] = [];
    const observingFetch: typeof globalThis.fetch = async (input, init) => {
      if (input instanceof Request && input.url === `${origin}/protected`) {
        fetchBodyStates.push(input.bodyUsed);
      }
      return globalThis.fetch(input, init);
    };
    const leashFetch = createTabFetch({
      address: payer,
      allowDevelopmentLoopback: true,
      apiBaseUrl: origin,
      apiKey: "agent_sk_integration",
      fetch: observingFetch,
      idempotencyKey: () => "mainnet-post-1",
      paymentProfile: "mainnet",
      paymentStateDirectory: stateDirectory,
    });

    expect(request.bodyUsed).toBe(false);
    const response = await leashFetch(request);

    expect(response.status).toBe(200);
    expect(fetchBodyStates).toEqual([false, false]);
    expect(protectedRequestBodies).toEqual([body, body]);
    expect(signRequests).toHaveLength(1);
    expect(signRequests[0]).toMatchObject({
      origin: { toolName: `POST ${origin}/protected` },
      resourceUrl: `${origin}/protected`,
    });
  });

  it("uses only Base Sepolia Circle USDC in the explicit integration profile", async () => {
    const leashFetch = createTabFetch({
      address: payer,
      allowDevelopmentLoopback: true,
      apiBaseUrl: origin,
      apiKey: "agent_sk_integration",
      fetch: globalThis.fetch,
      idempotencyKey: () => "sepolia-get-1",
      paymentProfile: "base_sepolia_integration",
      paymentStateDirectory: stateDirectory,
    });

    const response = await leashFetch(`${origin}/protected-testnet`);

    expect(response.status).toBe(200);
    expect(signRequests).toHaveLength(1);
    expect(signRequests[0]).toMatchObject({
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      network: "eip155:84532",
      signerRequest: {
        domain: {
          chainId: 84532,
          name: "USDC",
          verifyingContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          version: "2",
        },
      },
    });
  });
});
