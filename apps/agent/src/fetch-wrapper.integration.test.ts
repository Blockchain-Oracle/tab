import { createServer } from "node:http";

import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createLeashFetch } from "./fetch-wrapper.js";

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

describe("Leash fetch wrapper with real x402 and HTTP wires", () => {
  const signRequests: unknown[] = [];
  const signatures: `0x${string}`[] = [];
  const resultRequests: unknown[] = [];
  const protectedRequestBodies: string[] = [];
  let origin = "";
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://loopback").pathname;
    if (pathname === "/api/agent/sign") {
      expect(request.headers.authorization).toBe("Bearer leash_sk_integration");
      const body = await jsonRequest(request);
      signRequests.push(body);
      const signature = await payerAccount.signTypedData(body.signerRequest);
      signatures.push(signature);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ receiptId: "receipt-1", signature }));
      return;
    }
    if (pathname === "/api/agent/pay/result") {
      resultRequests.push(await jsonRequest(request));
      response.statusCode = 204;
      response.end();
      return;
    }
    if (pathname === "/protected") {
      protectedRequestBodies.push(await textRequest(request));
      const paymentHeader = request.headers["payment-signature"];
      if (typeof paymentHeader !== "string") {
        response.statusCode = 402;
        response.setHeader("PAYMENT-REQUIRED", encodePaymentRequiredHeader(paymentRequired));
        response.end("payment required");
        return;
      }
      const payload = decodePaymentSignatureHeader(paymentHeader);
      expect(payload).toMatchObject({
        accepted: { network: "eip155:8453" },
        payload: { signature: signatures.at(-1) },
      });
      response.setHeader(
        "PAYMENT-RESPONSE",
        encodePaymentResponseHeader({
          network: "eip155:8453",
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
    paymentRequired.resource.url = `${origin}/protected`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  beforeEach(() => {
    signRequests.length = 0;
    signatures.length = 0;
    resultRequests.length = 0;
    protectedRequestBodies.length = 0;
  });

  it("pays, retries, reports settlement, and redacts receipt-origin secrets", async () => {
    const leashFetch = createLeashFetch({
      address: payer,
      apiBaseUrl: origin,
      apiKey: "leash_sk_integration",
      fetch: globalThis.fetch,
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
    const leashFetch = createLeashFetch({
      address: payer,
      apiBaseUrl: origin,
      apiKey: "leash_sk_integration",
      fetch: observingFetch,
    });

    expect(request.bodyUsed).toBe(false);
    const response = await leashFetch(request);

    expect(response.status).toBe(200);
    expect(fetchBodyStates).toEqual([false, false]);
    expect(protectedRequestBodies).toEqual([body, body]);
    expect(signRequests).toHaveLength(1);
    expect(signRequests[0]).toMatchObject({
      origin: { toolName: `POST ${origin}/protected` },
    });
  });
});
