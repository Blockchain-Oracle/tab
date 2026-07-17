import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { PaymentRequired } from "@x402/core/types";
import { MCP_PAYMENT_META_KEY, MCP_PAYMENT_RESPONSE_META_KEY } from "@x402/mcp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createLeashPaymentClient } from "./payment-client.js";
import { createLeashProxyServer } from "./proxy.js";
import { LeashRemoteSigner } from "./remote-signer.js";

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
  resource: { url: "mcp://tool/search" },
  x402Version: 2,
} satisfies PaymentRequired;

describe("Leash MCP proxy with real SDK transports", () => {
  const upstreamServer = new Server(
    { name: "paid-upstream", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  const upstreamClient = new Client({ name: "leash-upstream", version: "0.0.1" });
  const downstream = new Client({ name: "Claude Code", version: "1.2.3" });
  const signBodies: unknown[] = [];
  const resultBodies: unknown[] = [];
  const paidMetadata: unknown[] = [];
  const remoteFetch = vi.fn(async (input: Request | string | URL, init?: RequestInit) => {
    const path = new URL(input.toString()).pathname;
    if (path === "/api/agent/sign") {
      signBodies.push(JSON.parse(String(init?.body)));
      return Response.json({ receiptId: "receipt-mcp", signature });
    }
    if (path === "/api/agent/pay/result") {
      resultBodies.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 204 });
    }
    return Response.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  });
  const signer = new LeashRemoteSigner({
    address: payer,
    apiBaseUrl: "https://tab.example.test",
    apiKey: "leash_sk_integration",
    fetch: remoteFetch,
  });
  const proxy = createLeashProxyServer({
    paymentClient: createLeashPaymentClient(signer),
    signer,
    upstream: upstreamClient,
  });

  beforeAll(async () => {
    upstreamServer.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: [{ inputSchema: { type: "object" }, name: "search" }],
    }));
    upstreamServer.setRequestHandler(CallToolRequestSchema, (request) => {
      const payment = request.params._meta?.[MCP_PAYMENT_META_KEY];
      if (!payment) {
        return {
          content: [{ text: JSON.stringify(paymentRequired), type: "text" }],
          isError: true,
          structuredContent: paymentRequired,
        };
      }
      paidMetadata.push(request.params._meta);
      return {
        _meta: {
          [MCP_PAYMENT_RESPONSE_META_KEY]: {
            network: "eip155:8453",
            payer,
            success: true,
            transaction,
          },
          upstreamMarker: "preserved",
        },
        content: [{ text: "paid result", type: "text" }],
        structuredContent: { answer: 42 },
      };
    });

    const [upstreamClientTransport, upstreamServerTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      upstreamServer.connect(upstreamServerTransport),
      upstreamClient.connect(upstreamClientTransport),
    ]);

    const [downstreamTransport, proxyTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([proxy.connect(proxyTransport), downstream.connect(downstreamTransport)]);
  });

  afterAll(async () => {
    await downstream.close();
    await proxy.close();
    await upstreamClient.close();
    await upstreamServer.close();
  });

  it("forwards tools, pays once, and preserves request/result metadata", async () => {
    await expect(downstream.listTools()).resolves.toMatchObject({ tools: [{ name: "search" }] });
    const result = await downstream.callTool({
      _meta: { traceId: "trace-1" },
      arguments: { query: "x402" },
      name: "search",
    });

    expect(result).toMatchObject({
      _meta: { upstreamMarker: "preserved" },
      content: [{ text: "paid result", type: "text" }],
      structuredContent: { answer: 42 },
    });
    expect(paidMetadata).toHaveLength(1);
    expect(paidMetadata[0]).toMatchObject({ traceId: "trace-1" });
    expect(signBodies[0]).toMatchObject({
      origin: { clientName: "Claude Code", toolName: "search", transport: "mcp" },
    });
    expect(resultBodies).toEqual([
      {
        outcome: "settled",
        paymentResponse: {
          network: "eip155:8453",
          payer,
          success: true,
          transaction,
        },
        receiptId: "receipt-mcp",
      },
    ]);
  });
});
