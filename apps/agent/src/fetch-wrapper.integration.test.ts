import { createServer } from "node:http";

import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createLeashFetch } from "./fetch-wrapper.js";

const payer = "0x2222222222222222222222222222222222222222" as const;
const signature = `0x${"ab".repeat(65)}` as const;
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

describe("Leash fetch wrapper with real x402 and HTTP wires", () => {
  const signRequests: unknown[] = [];
  const resultRequests: unknown[] = [];
  let origin = "";
  const server = createServer(async (request, response) => {
    if (request.url === "/api/agent/sign") {
      expect(request.headers.authorization).toBe("Bearer leash_sk_integration");
      signRequests.push(await jsonRequest(request));
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ receiptId: "receipt-1", signature }));
      return;
    }
    if (request.url === "/api/agent/pay/result") {
      resultRequests.push(await jsonRequest(request));
      response.statusCode = 204;
      response.end();
      return;
    }
    if (request.url === "/protected") {
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
        payload: { signature },
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

  it("pays, retries, and reports the settlement using shipped x402 packages", async () => {
    const leashFetch = createLeashFetch({
      address: payer,
      apiBaseUrl: origin,
      apiKey: "leash_sk_integration",
      fetch: globalThis.fetch,
    });

    const response = await leashFetch(`${origin}/protected`);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("protected result");
    expect(signRequests).toHaveLength(1);
    expect(signRequests[0]).toMatchObject({
      amount: "25000",
      network: "eip155:8453",
      origin: { clientName: "leash-fetch", transport: "http" },
    });
    expect(resultRequests).toEqual([
      {
        outcome: "settled",
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
});
