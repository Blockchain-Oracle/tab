import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CLI_REQUEST_DEADLINE_MS = 15_000;
const CLI_TEST_TIMEOUT_MS = 25_000;

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

function definedEnvironment(values: NodeJS.ProcessEnv) {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

function textResult(result: unknown) {
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

function cliProcessArguments(arguments_: string[]) {
  const builtEntry = process.env.LEASH_CLI_ENTRY;
  return builtEntry
    ? { args: [path.resolve(builtEntry), ...arguments_], command: process.execPath }
    : {
        args: [path.resolve("src/cli.ts"), ...arguments_],
        command: path.resolve("node_modules/.bin/tsx"),
      };
}

describe("leash-mcp stdio CLI", () => {
  const connectBodiesByApiKey = new Map<string, unknown[]>();
  const upstreamCalls: string[] = [];
  const upstream = new Server(
    { name: "stdio-upstream", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  const upstreamTransport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID });
  let origin = "";
  const loopback = createServer(async (request, response) => {
    if (request.url === "/api/agent/connect") {
      const authorization = request.headers.authorization;
      const bodies = authorization?.startsWith("Bearer ")
        ? connectBodiesByApiKey.get(authorization.slice("Bearer ".length))
        : undefined;
      if (!bodies) {
        response.statusCode = 401;
        response.end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      bodies.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ agent: { address: null }, paymentProfile: "mainnet" }));
      return;
    }
    if (request.url === "/mcp") {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const rawBody = Buffer.concat(chunks).toString("utf8");
      await upstreamTransport.handleRequest(
        request,
        response,
        rawBody ? JSON.parse(rawBody) : undefined,
      );
      return;
    }
    if (request.url === "/free") {
      response.end("stdio result");
      return;
    }
    response.statusCode = 404;
    response.end();
  });

  beforeAll(async () => {
    upstream.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: [
        { inputSchema: { type: "object" }, name: "free" },
        { inputSchema: { type: "object" }, name: "paid" },
      ],
    }));
    upstream.setRequestHandler(CallToolRequestSchema, (request) => {
      upstreamCalls.push(request.params.name);
      if (request.params.name === "paid") {
        return {
          content: [{ text: JSON.stringify(paymentRequired), type: "text" }],
          isError: true,
          structuredContent: paymentRequired,
        };
      }
      return { content: [{ text: "proxied free result", type: "text" }] };
    });
    await upstream.connect(upstreamTransport as Transport);
    await new Promise<void>((resolve) => loopback.listen(0, "127.0.0.1", resolve));
    const address = loopback.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP listener");
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await upstream.close();
    await new Promise<void>((resolve, reject) =>
      loopback.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it(
    "boots the actual TypeScript bin over stdio without corrupting protocol stdout",
    async () => {
      const apiKey = `leash_sk_${"d".repeat(42)}1`;
      const connectBodies: unknown[] = [];
      connectBodiesByApiKey.set(apiKey, connectBodies);
      const requestOptions = {
        signal: AbortSignal.timeout(CLI_REQUEST_DEADLINE_MS),
        timeout: CLI_REQUEST_DEADLINE_MS,
      };
      const cli = cliProcessArguments([]);
      const transport = new StdioClientTransport({
        args: cli.args,
        command: cli.command,
        cwd: process.cwd(),
        env: definedEnvironment({
          ...process.env,
          LEASH_ALLOW_DEVELOPMENT_LOOPBACK: "1",
          LEASH_API_BASE_URL: origin,
          LEASH_API_KEY: apiKey,
        }),
        stderr: "pipe",
      });
      const client = new Client({ name: "stdio-integration", version: "1.0.0" });
      const stderr: Buffer[] = [];
      transport.stderr?.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
      try {
        await client.connect(transport, requestOptions);
        await expect(client.listTools(undefined, requestOptions)).resolves.toMatchObject({
          tools: [{ name: "paid_fetch" }],
        });
        const result = await client.callTool(
          {
            arguments: { idempotencyKey: "stdio-free-1", url: `${origin}/free` },
            name: "paid_fetch",
          },
          undefined,
          requestOptions,
        );
        expect(textResult(result)).toMatchObject({ body: "stdio result", status: 200 });
        expect(connectBodies).toEqual([{ transport: "mcp" }]);
        expect(Buffer.concat(stderr).toString("utf8")).toBe("");
      } finally {
        try {
          await client.close();
        } finally {
          connectBodiesByApiKey.delete(apiKey);
        }
      }
    },
    CLI_TEST_TIMEOUT_MS,
  );

  it(
    "wires stdio through a real Streamable HTTP upstream and keeps free tools usable",
    async () => {
      const apiKey = `leash_sk_${"d".repeat(42)}2`;
      const connectBodies: unknown[] = [];
      connectBodiesByApiKey.set(apiKey, connectBodies);
      upstreamCalls.length = 0;
      const requestOptions = {
        signal: AbortSignal.timeout(CLI_REQUEST_DEADLINE_MS),
        timeout: CLI_REQUEST_DEADLINE_MS,
      };
      const cli = cliProcessArguments(["--upstream", `${origin}/mcp`]);
      const transport = new StdioClientTransport({
        args: cli.args,
        command: cli.command,
        cwd: process.cwd(),
        env: definedEnvironment({
          ...process.env,
          LEASH_ALLOW_DEVELOPMENT_LOOPBACK: "1",
          LEASH_API_BASE_URL: origin,
          LEASH_API_KEY: apiKey,
        }),
        stderr: "pipe",
      });
      const client = new Client({ name: "proxy-integration", version: "1.0.0" });
      const stderr: Buffer[] = [];
      transport.stderr?.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
      try {
        await client.connect(transport, requestOptions);
        await expect(client.listTools(undefined, requestOptions)).resolves.toMatchObject({
          tools: [{ name: "free" }, { name: "paid" }],
        });
        await expect(
          client.callTool({ name: "free" }, undefined, requestOptions),
        ).resolves.toMatchObject({ content: [{ text: "proxied free result", type: "text" }] });
        await expect(client.callTool({ name: "paid" }, undefined, requestOptions)).rejects.toThrow(
          "SIGNER_NOT_CONFIGURED",
        );
        expect(upstreamCalls).toEqual(["free", "paid"]);
        expect(connectBodies).toEqual([{ transport: "mcp" }]);
        expect(Buffer.concat(stderr).toString("utf8")).toBe("");
      } finally {
        try {
          await client.close();
        } finally {
          connectBodiesByApiKey.delete(apiKey);
        }
      }
    },
    CLI_TEST_TIMEOUT_MS,
  );
});
