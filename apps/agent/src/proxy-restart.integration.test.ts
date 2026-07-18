import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { PaymentRequired } from "@x402/core/types";
import { MCP_PAYMENT_META_KEY, MCP_PAYMENT_RESPONSE_META_KEY } from "@x402/mcp";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createDurableMcpPayment,
  MCP_PAYMENT_IDEMPOTENCY_META_KEY,
} from "./durable-mcp-payment.js";
import { createLeashPaymentClient } from "./payment-client.js";
import { PaymentEnvelopeStore } from "./payment-envelope-store.js";
import { createLeashProxyServer } from "./proxy.js";
import { LeashRemoteSigner } from "./remote-signer.js";

const payerAccount = privateKeyToAccount(`0x${"22".repeat(32)}`);
const payer = payerAccount.address;
const transaction = `0x${"ef".repeat(32)}`;
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

describe("durable MCP proxy restart recovery", () => {
  const stateDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      stateDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it("replays the exact signed payload after a lost paid response and restart", async () => {
    const stateDirectory = join(tmpdir(), `tab-mcp-restart-${process.pid}-${Date.now()}`);
    stateDirectories.push(stateDirectory);
    const upstreamServer = new Server(
      { name: "ambiguous-upstream", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    const upstreamClient = new Client({ name: "leash-upstream", version: "0.0.1" });
    const paidPayloads: unknown[] = [];
    const signBodies: Array<Record<string, unknown>> = [];
    let loseFirstPaidResponse = true;
    upstreamServer.setRequestHandler(CallToolRequestSchema, (request) => {
      const payment = request.params._meta?.[MCP_PAYMENT_META_KEY];
      if (!payment) {
        return {
          content: [{ text: JSON.stringify(challenge), type: "text" }],
          isError: true,
          structuredContent: challenge,
        };
      }
      paidPayloads.push(payment);
      if (loseFirstPaidResponse) {
        loseFirstPaidResponse = false;
        throw new Error("paid result was lost");
      }
      return {
        _meta: {
          [MCP_PAYMENT_RESPONSE_META_KEY]: {
            network: "eip155:8453",
            payer,
            success: true,
            transaction,
          },
        },
        content: [{ text: "recovered", type: "text" }],
      };
    });
    const [upstreamClientTransport, upstreamServerTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      upstreamServer.connect(upstreamServerTransport),
      upstreamClient.connect(upstreamClientTransport),
    ]);

    const remoteFetch = vi.fn(async (input: Request | string | URL, init?: RequestInit) => {
      const path = new URL(input.toString()).pathname;
      if (path === "/api/agent/sign") {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        signBodies.push(body);
        const signerRequest = body.signerRequest as Parameters<
          typeof payerAccount.signTypedData
        >[0];
        return Response.json({
          receiptId: "receipt-mcp-restart-1",
          signature: await payerAccount.signTypedData(signerRequest),
        });
      }
      if (path === "/api/agent/pay/result") return new Response(null, { status: 204 });
      return new Response(null, { status: 404 });
    });

    const startProxy = async () => {
      const signer = new LeashRemoteSigner({
        address: payer,
        apiBaseUrl: "https://tab.example.test",
        apiKey: "leash_sk_restart",
        fetch: remoteFetch,
        paymentProfile: "mainnet",
      });
      const proxy = createLeashProxyServer({
        payment: createDurableMcpPayment({
          address: payer,
          client: createLeashPaymentClient(signer, "mainnet"),
          paymentProfile: "mainnet",
          signer,
          store: new PaymentEnvelopeStore(payer, stateDirectory),
        }),
        upstream: upstreamClient,
      });
      const downstream = new Client({ name: "Claude Code", version: "1.2.3" });
      const [downstreamTransport, proxyTransport] = InMemoryTransport.createLinkedPair();
      await Promise.all([proxy.connect(proxyTransport), downstream.connect(downstreamTransport)]);
      return { downstream, proxy, signer };
    };

    const params = {
      _meta: { [MCP_PAYMENT_IDEMPOTENCY_META_KEY]: "mcp-restart-payment-1" },
      arguments: { query: "durable" },
      name: "search",
    };
    const first = await startProxy();
    await expect(first.downstream.callTool(params)).rejects.toThrow(/paid result was lost/);
    await first.downstream.close();
    await first.proxy.close();

    const restarted = await startProxy();
    await expect(restarted.downstream.callTool(params)).resolves.toMatchObject({
      content: [{ text: "recovered", type: "text" }],
    });
    await restarted.signer.flushPaymentObservations();

    expect(signBodies).toHaveLength(1);
    expect(paidPayloads).toHaveLength(2);
    expect(paidPayloads[1]).toEqual(paidPayloads[0]);

    await restarted.downstream.close();
    await restarted.proxy.close();
    await upstreamClient.close();
    await upstreamServer.close();
  });
});
