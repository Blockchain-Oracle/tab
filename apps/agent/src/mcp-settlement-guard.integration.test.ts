import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PaymentRequired, SettleResponse } from "@x402/core/types";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

import {
  createDurableMcpPayment,
  MCP_PAYMENT_IDEMPOTENCY_META_KEY,
} from "./durable-mcp-payment.js";
import { createLeashPaymentClient } from "./payment-client.js";
import { PaymentEnvelopeStore } from "./payment-envelope-store.js";
import { TabRemoteSigner } from "./remote-signer.js";

const account = privateKeyToAccount(`0x${"51".repeat(32)}`);
const transaction = `0x${"52".repeat(32)}`;
const challenge = {
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
  resource: { url: "mcp://seller.example.test/tool/search" },
  x402Version: 2,
} satisfies PaymentRequired;
const settlement = {
  network: "eip155:8453",
  payer: account.address,
  success: true,
  transaction,
} satisfies SettleResponse;
const reverted = {
  errorReason: "invalid_exact_evm_transaction_failed",
  network: "eip155:8453",
  payer: account.address,
  success: false,
  transaction,
} satisfies SettleResponse;

describe("durable MCP settlement acknowledgement guard", () => {
  it.each([
    {
      acknowledgement: {
        body: { receiptId: "receipt-mcp-guard", status: "pending", verified: false },
        status: 202,
      },
      expectedState: "observed",
      label: "returns 202 pending for seller success metadata",
      settlement,
    },
    {
      acknowledgement: {
        body: { receiptId: "receipt-mcp-guard", status: "failed", verified: true },
        status: 200,
      },
      expectedState: "observed",
      label: "verifies a reverted transaction with a still-live authorization",
      settlement: reverted,
    },
    {
      acknowledgement: {
        body: { receiptId: "receipt-mcp-guard", status: "settled", verified: true },
        status: 200,
      },
      expectedState: undefined,
      label: "exactly verifies the installed x402 amount wire",
      settlement: { ...settlement, amount: "25000" },
    },
    {
      acknowledgement: {
        body: { receiptId: "receipt-mcp-guard", status: "settled", verified: true },
        status: 200,
      },
      expectedState: "pending",
      label: "receives a seller amount that differs from the signed requirement",
      settlement: { ...settlement, amount: "25001" },
    },
    {
      acknowledgement: {
        body: { receiptId: "receipt-mcp-guard", status: "settled", verified: true },
        status: 200,
      },
      expectedState: undefined,
      label: "exactly verifies settlement",
      settlement,
    },
  ])("keeps the authorization blocking when Tab $label", async (testCase) => {
    const stateDirectory = await mkdtemp(join(tmpdir(), "tab-mcp-settlement-guard-"));
    const remoteFetch: typeof globalThis.fetch = async (input, init) => {
      if (new URL(input.toString()).pathname === "/api/agent/sign") {
        const body = JSON.parse(String(init?.body));
        return Response.json({
          receiptId: "receipt-mcp-guard",
          signature: await account.signTypedData(body.signerRequest),
        });
      }
      return Response.json(testCase.acknowledgement.body, {
        status: testCase.acknowledgement.status,
      });
    };
    try {
      const signer = new TabRemoteSigner({
        address: account.address,
        apiBaseUrl: "https://tab.example.test",
        apiKey: "agent_sk_guard",
        fetch: remoteFetch,
        paymentProfile: "mainnet",
        reportAttempts: 1,
      });
      const store = new PaymentEnvelopeStore(account.address, stateDirectory);
      const payment = createDurableMcpPayment({
        address: account.address,
        client: createLeashPaymentClient(signer, "mainnet"),
        paymentProfile: "mainnet",
        signer,
        store,
      });
      const params = {
        _meta: { [MCP_PAYMENT_IDEMPOTENCY_META_KEY]: `mcp-${testCase.acknowledgement.status}` },
        arguments: { query: "guard" },
        name: "search",
      };
      const context = await payment.create(params, challenge);
      await payment.observe(context, testCase.settlement);

      expect((await store.findUnsettled())?.record.state).toBe(testCase.expectedState);
    } finally {
      await rm(stateDirectory, { force: true, recursive: true });
    }
  });

  it("persists an observation and reposts it through Tab after restart", async () => {
    const stateDirectory = await mkdtemp(join(tmpdir(), "tab-mcp-observation-restart-"));
    let acknowledgement = Response.json({ error: { code: "OUTAGE" } }, { status: 503 });
    const resultBodies: unknown[] = [];
    const remoteFetch: typeof globalThis.fetch = async (input, init) => {
      const pathname = new URL(input.toString()).pathname;
      if (pathname === "/api/agent/sign") {
        const body = JSON.parse(String(init?.body));
        return Response.json({
          receiptId: "receipt-mcp-guard",
          signature: await account.signTypedData(body.signerRequest),
        });
      }
      if (pathname === "/api/agent/pay/result") {
        resultBodies.push(JSON.parse(String(init?.body)));
        return acknowledgement.clone();
      }
      return new Response(null, { status: 404 });
    };
    const start = () => {
      const signer = new TabRemoteSigner({
        address: account.address,
        apiBaseUrl: "https://tab.example.test",
        apiKey: "agent_sk_guard",
        fetch: remoteFetch,
        paymentProfile: "mainnet",
        reportAttempts: 1,
      });
      const store = new PaymentEnvelopeStore(account.address, stateDirectory);
      return {
        payment: createDurableMcpPayment({
          address: account.address,
          client: createLeashPaymentClient(signer, "mainnet"),
          paymentProfile: "mainnet",
          signer,
          store,
        }),
        store,
      };
    };
    const params = {
      _meta: { [MCP_PAYMENT_IDEMPOTENCY_META_KEY]: "mcp-observation-restart" },
      arguments: { query: "durable" },
      name: "search",
    };
    try {
      const first = start();
      const context = await first.payment.create(params, challenge);
      await first.payment.observe(context, settlement);
      expect((await first.store.findUnsettled())?.record).toMatchObject({
        settlementObservation: settlement,
        state: "observed",
      });

      resultBodies.length = 0;
      acknowledgement = Response.json({
        receiptId: "receipt-mcp-guard",
        status: "settled",
        verified: true,
      });
      const restarted = start();
      await expect(restarted.payment.load(params)).resolves.not.toBeNull();
      expect(resultBodies).toEqual([
        {
          outcome: "observed",
          paymentResponse: settlement,
          receiptId: "receipt-mcp-guard",
        },
      ]);
      expect(await restarted.store.findUnsettled()).toBeNull();
    } finally {
      await rm(stateDirectory, { force: true, recursive: true });
    }
  });
});
