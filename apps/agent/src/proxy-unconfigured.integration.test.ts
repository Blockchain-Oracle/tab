import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createLeashProxyServer } from "./proxy.js";

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
  resource: { url: "mcp://tool/paid" },
  x402Version: 2,
};

describe("Tab MCP proxy without a configured signer", () => {
  const upstreamServer = new Server(
    { name: "free-upstream", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  const upstreamClient = new Client({ name: "leash-upstream", version: "0.0.1" });
  const downstream = new Client({ name: "integration-host", version: "1.0.0" });
  const calls: string[] = [];
  const proxy = createLeashProxyServer({ upstream: upstreamClient });

  beforeAll(async () => {
    upstreamServer.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: [
        { inputSchema: { type: "object" }, name: "free" },
        { inputSchema: { type: "object" }, name: "paid" },
      ],
    }));
    upstreamServer.setRequestHandler(CallToolRequestSchema, (request) => {
      calls.push(request.params.name);
      if (request.params.name === "paid") {
        return {
          content: [{ text: JSON.stringify(paymentRequired), type: "text" }],
          isError: true,
          structuredContent: paymentRequired,
        };
      }
      return { content: [{ text: "free result", type: "text" }] };
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

  it("lists and calls free upstream tools", async () => {
    await expect(downstream.listTools()).resolves.toMatchObject({
      tools: [{ name: "free" }, { name: "paid" }],
    });
    await expect(downstream.callTool({ name: "free" })).resolves.toMatchObject({
      content: [{ text: "free result", type: "text" }],
    });
  });

  it("reports SIGNER_NOT_CONFIGURED on a challenge without retrying upstream", async () => {
    calls.length = 0;
    await expect(downstream.callTool({ name: "paid" })).rejects.toThrow("SIGNER_NOT_CONFIGURED");
    expect(calls).toEqual(["paid"]);
  });
});
