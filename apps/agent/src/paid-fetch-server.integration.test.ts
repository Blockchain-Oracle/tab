import { createServer } from "node:http";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPaidFetchServer } from "./paid-fetch-server.js";

function toolJson(result: unknown) {
  if (
    typeof result !== "object" ||
    result === null ||
    !("content" in result) ||
    !Array.isArray(result.content)
  ) {
    throw new Error("Expected tool content");
  }
  const content = result.content[0];
  if (content?.type !== "text") throw new Error("Expected text tool content");
  return JSON.parse(content.text) as Record<string, unknown>;
}

describe("standalone paid_fetch MCP tool", () => {
  const requests: Array<{ body: string; header: string | undefined; method: string }> = [];
  let origin = "";
  const httpServer = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({
      body: Buffer.concat(chunks).toString("utf8"),
      header: request.headers["x-test"] as string | undefined,
      method: request.method ?? "",
    });
    if (request.url === "/paid") {
      response.statusCode = 402;
      response.end("payment required");
      return;
    }
    if (request.url === "/large") {
      response.end("x".repeat(300_000));
      return;
    }
    response.statusCode = 201;
    response.setHeader("x-origin", "loopback");
    response.end("free response");
  });
  const server = createPaidFetchServer({
    address: null,
    apiBaseUrl: "https://tab.example.test",
    apiKey: `leash_sk_${"c".repeat(43)}`,
    fetch: globalThis.fetch,
  });
  const client = new Client({ name: "integration-host", version: "1.0.0" });

  beforeAll(async () => {
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP listener");
    origin = `http://127.0.0.1:${address.port}`;
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });

  afterAll(async () => {
    await client.close();
    await server.close();
    await new Promise<void>((resolve, reject) =>
      httpServer.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("advertises one strict universal fetch tool", async () => {
    await expect(client.listTools()).resolves.toMatchObject({
      tools: [
        {
          inputSchema: {
            additionalProperties: false,
            required: ["url"],
            type: "object",
          },
          name: "paid_fetch",
        },
      ],
    });
  });

  it("forwards a free request and returns a bounded structured response", async () => {
    requests.length = 0;
    const result = await client.callTool({
      arguments: {
        body: "hello",
        headers: { "x-test": "forwarded" },
        method: "POST",
        url: `${origin}/free`,
      },
      name: "paid_fetch",
    });

    expect(result.isError).not.toBe(true);
    expect(toolJson(result)).toMatchObject({
      body: "free response",
      headers: { "x-origin": "loopback" },
      status: 201,
      truncated: false,
    });
    expect(requests).toEqual([{ body: "hello", header: "forwarded", method: "POST" }]);
  });

  it("allows free traffic but fails honestly on 402 without a signer address", async () => {
    const result = await client.callTool({
      arguments: { url: `${origin}/paid` },
      name: "paid_fetch",
    });

    expect(result.isError).toBe(true);
    expect(toolJson(result)).toEqual({
      error: {
        code: "SIGNER_NOT_CONFIGURED",
        message: "Leash signing is not configured for this agent.",
      },
    });
  });

  it("truncates oversized bodies and rejects non-HTTP or non-schema input", async () => {
    const large = toolJson(
      await client.callTool({ arguments: { url: `${origin}/large` }, name: "paid_fetch" }),
    );
    expect(large.truncated).toBe(true);
    expect(String(large.body).length).toBeLessThanOrEqual(262_144);

    for (const arguments_ of [
      { url: "file:///tmp/secret" },
      { extra: true, url: `${origin}/free` },
      { body: "not allowed", method: "GET", url: `${origin}/free` },
    ]) {
      const invalid = await client.callTool({ arguments: arguments_, name: "paid_fetch" });
      expect(invalid.isError).toBe(true);
      expect(toolJson(invalid)).toMatchObject({ error: { code: "INVALID_FETCH_REQUEST" } });
    }
  });
});
