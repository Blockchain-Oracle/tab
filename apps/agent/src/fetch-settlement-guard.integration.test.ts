import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import type { PaymentRequired, SettleResponse } from "@x402/core/types";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTabFetch } from "./fetch-wrapper.js";
import { PaymentEnvelopeStore } from "./payment-envelope-store.js";
import { TabRemoteSigner } from "./remote-signer.js";

const account = privateKeyToAccount(`0x${"41".repeat(32)}`);
const transaction = `0x${"42".repeat(32)}`;
const requirements = {
  amount: "25000",
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  extra: { name: "USD Coin", version: "2" },
  maxTimeoutSeconds: 60,
  network: "eip155:8453",
  payTo: "0x1111111111111111111111111111111111111111",
  scheme: "exact",
} as const;
const challenge = {
  accepts: [requirements],
  resource: { url: "http://127.0.0.1/protected" },
  x402Version: 2,
} satisfies PaymentRequired;
const succeeded = {
  network: requirements.network,
  payer: account.address,
  success: true,
  transaction,
} satisfies SettleResponse;
const reverted = {
  errorReason: "invalid_exact_evm_transaction_failed",
  network: requirements.network,
  payer: account.address,
  success: false,
  transaction,
} satisfies SettleResponse;
const succeededWithAmount = { ...succeeded, amount: requirements.amount } satisfies SettleResponse;

async function jsonBody(request: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

describe("durable HTTP settlement acknowledgement guard", () => {
  let acknowledgement: { body: Record<string, unknown>; status: number };
  const events: string[] = [];
  let origin = "";
  const resultBodies: unknown[] = [];
  let sellerResponse: SettleResponse = succeeded;
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://loopback").pathname;
    if (pathname === "/api/agent/sign") {
      const body = await jsonBody(request);
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          receiptId: "receipt-http-guard",
          signature: await account.signTypedData(body.signerRequest),
        }),
      );
      return;
    }
    if (pathname === "/api/agent/pay/result") {
      events.push("result");
      resultBodies.push(await jsonBody(request));
      response.statusCode = acknowledgement.status;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(acknowledgement.body));
      return;
    }
    if (pathname === "/protected") {
      if (typeof request.headers["payment-signature"] !== "string") {
        response.statusCode = 402;
        response.setHeader("PAYMENT-REQUIRED", encodePaymentRequiredHeader(challenge));
        response.end("payment required");
        return;
      }
      events.push("seller-paid");
      response.setHeader("PAYMENT-RESPONSE", encodePaymentResponseHeader(sellerResponse));
      response.end("seller result");
      return;
    }
    response.statusCode = 404;
    response.end();
  });

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP listener");
    origin = `http://127.0.0.1:${address.port}`;
    challenge.resource.url = `${origin}/protected`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it.each([
    {
      acknowledgement: {
        body: { receiptId: "receipt-http-guard", status: "pending", verified: false },
        status: 202,
      },
      label: "Tab returns 202 pending for seller success metadata",
      pending: true,
      sellerResponse: succeeded,
    },
    {
      acknowledgement: {
        body: { receiptId: "receipt-http-guard", status: "failed", verified: true },
        status: 200,
      },
      label: "Tab verifies a reverted transaction while its authorization is still live",
      pending: true,
      sellerResponse: reverted,
    },
    {
      acknowledgement: {
        body: {
          extra: "seller-controlled",
          receiptId: "receipt-http-guard",
          status: "settled",
          verified: true,
        },
        status: 200,
      },
      label: "Tab response is not the exact authenticated acknowledgement shape",
      pending: true,
      sellerResponse: succeeded,
    },
    {
      acknowledgement: {
        body: { receiptId: "receipt-http-guard", status: "settled", verified: true },
        status: 200,
      },
      label: "Tab exactly verifies the installed x402 wire with its exact amount",
      pending: false,
      sellerResponse: succeededWithAmount,
    },
    {
      acknowledgement: {
        body: { receiptId: "receipt-http-guard", status: "settled", verified: true },
        status: 200,
      },
      label: "seller metadata reports an amount other than the signed requirement",
      pending: true,
      sellerResponse: { ...succeeded, amount: "25001" },
    },
    {
      acknowledgement: {
        body: { receiptId: "receipt-http-guard", status: "settled", verified: true },
        status: 200,
      },
      label: "Tab exactly verifies settlement",
      pending: false,
      sellerResponse: succeeded,
    },
  ])("keeps the authorization pending when $label", async (testCase) => {
    acknowledgement = testCase.acknowledgement;
    sellerResponse = testCase.sellerResponse;
    const stateDirectory = await mkdtemp(join(tmpdir(), "tab-http-settlement-guard-"));
    try {
      const signer = new TabRemoteSigner({
        address: account.address,
        apiBaseUrl: origin,
        apiKey: "agent_sk_guard",
        fetch: globalThis.fetch,
        paymentProfile: "mainnet",
        reportAttempts: 1,
      });
      const response = await createTabFetch({
        address: account.address,
        allowDevelopmentLoopback: true,
        apiBaseUrl: origin,
        apiKey: "agent_sk_guard",
        fetch: globalThis.fetch,
        idempotencyKey: () => "http-settlement-guard",
        paymentProfile: "mainnet",
        paymentStateDirectory: stateDirectory,
        signer,
      })(`${origin}/protected`);

      expect(response.status).toBe(200);
      expect(
        Boolean(await new PaymentEnvelopeStore(account.address, stateDirectory).findUnsettled()),
      ).toBe(testCase.pending);
    } finally {
      await rm(stateDirectory, { force: true, recursive: true });
    }
  });

  it("reposts a crash-surviving observation before retrying the seller after restart", async () => {
    const stateDirectory = await mkdtemp(join(tmpdir(), "tab-http-observation-restart-"));
    const options = () => {
      const signer = new TabRemoteSigner({
        address: account.address,
        apiBaseUrl: origin,
        apiKey: "agent_sk_guard",
        fetch: globalThis.fetch,
        paymentProfile: "mainnet",
        reportAttempts: 1,
      });
      return {
        address: account.address,
        allowDevelopmentLoopback: true,
        apiBaseUrl: origin,
        apiKey: "agent_sk_guard",
        fetch: globalThis.fetch,
        idempotencyKey: () => "http-observation-restart",
        paymentProfile: "mainnet" as const,
        paymentStateDirectory: stateDirectory,
        signer,
      };
    };
    try {
      acknowledgement = { body: { error: { code: "OUTAGE" } }, status: 503 };
      sellerResponse = succeeded;
      await createTabFetch(options())(`${origin}/protected`);
      const unsettled = await new PaymentEnvelopeStore(
        account.address,
        stateDirectory,
      ).findUnsettled();
      expect(unsettled?.record).toMatchObject({
        settlementObservation: succeeded,
        state: "observed",
      });

      events.length = 0;
      resultBodies.length = 0;
      acknowledgement = {
        body: { receiptId: "receipt-http-guard", status: "settled", verified: true },
        status: 200,
      };
      await createTabFetch(options())(`${origin}/protected`);

      expect(events[0]).toBe("result");
      expect(resultBodies[0]).toMatchObject({
        paymentResponse: succeeded,
        receiptId: "receipt-http-guard",
      });
      expect(
        await new PaymentEnvelopeStore(account.address, stateDirectory).findUnsettled(),
      ).toBeNull();
    } finally {
      await rm(stateDirectory, { force: true, recursive: true });
    }
  });
});
