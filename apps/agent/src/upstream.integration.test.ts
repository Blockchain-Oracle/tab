import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PaymentTargetPolicyError } from "./payment-target-policy.js";
import { connectStreamableHttpUpstream } from "./upstream.js";

describe("real Streamable HTTP upstream client", () => {
  const upstream = new Server(
    { name: "loopback-upstream", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID });
  const httpServer = createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const text = Buffer.concat(chunks).toString("utf8");
      await transport.handleRequest(request, response, text ? JSON.parse(text) : undefined);
    } catch (error) {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : String(error));
    }
  });
  let endpoint = "";

  beforeAll(async () => {
    upstream.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: [{ inputSchema: { type: "object" }, name: "echo" }],
    }));
    upstream.setRequestHandler(CallToolRequestSchema, (request) => ({
      content: [{ text: JSON.stringify(request.params.arguments), type: "text" }],
    }));
    await upstream.connect(transport as Transport);
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP listener");
    endpoint = `http://127.0.0.1:${address.port}/mcp`;
  });

  afterAll(async () => {
    await upstream.close();
    await new Promise<void>((resolve, reject) =>
      httpServer.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("initializes, lists, and calls through the shipped client transport", async () => {
    const inspectingFetch: typeof globalThis.fetch = async (input, init) => {
      const response = await globalThis.fetch(input, init);
      if (!response.ok) {
        throw new Error(`loopback ${response.status}: ${await response.clone().text()}`);
      }
      return response;
    };
    const connection = await connectStreamableHttpUpstream(endpoint, {
      allowDevelopmentLoopback: true,
      fetch: inspectingFetch,
    });
    try {
      await expect(connection.client.listTools()).resolves.toMatchObject({
        tools: [{ name: "echo" }],
      });
      await expect(
        connection.client.callTool({ arguments: { value: "real-wire" }, name: "echo" }),
      ).resolves.toMatchObject({
        content: [{ text: JSON.stringify({ value: "real-wire" }), type: "text" }],
      });
    } finally {
      await connection.close();
    }
  });

  it("rejects a public upstream name that resolves to a private address before transport", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(
      connectStreamableHttpUpstream("https://upstream.example/mcp", {
        fetch,
        lookup: async () => [{ address: "10.0.0.8", family: 4 }],
      }),
    ).rejects.toBeInstanceOf(PaymentTargetPolicyError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
