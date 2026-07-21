import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { isDeepStrictEqual } from "node:util";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  isInitializeRequest,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import {
  attachPaymentResponseToMeta,
  createPaymentRequiredError,
  MCP_PAYMENT_META_KEY,
  MCP_PAYMENT_RESPONSE_META_KEY,
} from "@x402/mcp";
import { privateKeyToAccount } from "viem/accounts";

const [executable, consumerDirectory, stateDirectory] = process.argv.slice(2);
if (!executable || !consumerDirectory || !stateDirectory) {
  throw new Error("packed upstream E2E requires executable, consumer, and state paths");
}

const testAccount = privateKeyToAccount(`0x${"41".repeat(32)}`);
const testApiKey = `agent_sk_${"u".repeat(43)}`;
const testTransaction = `0x${"bc".repeat(32)}`;
const challenge = {
  accepts: [
    {
      amount: "1000",
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      extra: { name: "USDC", version: "2" },
      maxTimeoutSeconds: 60,
      network: "eip155:84532",
      payTo: "0x1111111111111111111111111111111111111111",
      scheme: "exact",
    },
  ],
  resource: { url: "mcp://packed-upstream.test/tool/paid" },
  x402Version: 2,
};
const challengeError = createPaymentRequiredError(challenge);
const connectBodies = [];
const paidPayloadBytes = [];
const resultReports = [];
const signRequests = [];
let challengeCount = 0;
let droppedPaidResponse = false;
let observationAcknowledged = false;
let origin = "";

function fail(message) {
  throw new Error(`packed upstream E2E failed: ${message}`);
}

function definedEnvironment(environment) {
  return Object.fromEntries(Object.entries(environment).filter(([, value]) => value !== undefined));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return { parsed: raw ? JSON.parse(raw) : undefined, raw };
}

function hasPayment(parsed) {
  return parsed?.params?._meta?.[MCP_PAYMENT_META_KEY] !== undefined;
}

async function writeWebResponse(webResponse, response) {
  response.statusCode = webResponse.status;
  webResponse.headers.forEach((value, name) => {
    response.setHeader(name, value);
  });
  response.end(Buffer.from(await webResponse.arrayBuffer()));
}

const sessions = new Map();

async function createUpstreamSession() {
  const server = new Server(
    { name: "packed-upstream", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    onsessionclosed: async (sessionId) => {
      sessions.delete(sessionId);
      await server.close().catch(() => undefined);
    },
    onsessioninitialized: (sessionId) => {
      sessions.set(sessionId, { server, transport });
    },
    sessionIdGenerator: randomUUID,
  });
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [{ inputSchema: { type: "object" }, name: "paid" }],
  }));
  server.setRequestHandler(CallToolRequestSchema, (request) => {
    const payment = request.params._meta?.[MCP_PAYMENT_META_KEY];
    if (!payment) {
      challengeCount += 1;
      throw new McpError(challengeError.code, challengeError.message, challengeError.data);
    }
    paidPayloadBytes.push(JSON.stringify(payment));
    return attachPaymentResponseToMeta(
      { content: [{ text: "packed upstream paid result", type: "text" }] },
      {
        network: "eip155:84532",
        payer: testAccount.address,
        success: true,
        transaction: testTransaction,
      },
    );
  });
  await server.connect(transport);
  return { server, transport };
}

const httpServer = createServer(async (request, response) => {
  try {
    if (request.url === "/api/agent/connect") {
      const { parsed } = await readJson(request);
      if (request.headers.authorization !== `Bearer ${testApiKey}`) fail("connect auth mismatch");
      connectBodies.push(parsed);
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          agent: { address: testAccount.address },
          paymentProfile: "base_sepolia_integration",
        }),
      );
      return;
    }
    if (request.url === "/api/agent/sign") {
      const { parsed } = await readJson(request);
      signRequests.push(parsed);
      const signature = await testAccount.signTypedData(parsed.signerRequest);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ receiptId: "packed-upstream-receipt-1", signature }));
      return;
    }
    if (request.url === "/api/agent/pay/result") {
      resultReports.push((await readJson(request)).parsed);
      await new Promise((resolve) => setTimeout(resolve, 150));
      if (request.socket.destroyed || response.destroyed) return;
      response.statusCode = 204;
      response.end();
      observationAcknowledged = true;
      return;
    }
    if (request.url === "/mcp") {
      const { parsed, raw } = await readJson(request);
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (Array.isArray(value)) for (const item of value) headers.append(name, item);
        else if (value !== undefined) headers.set(name, value);
      }
      const sessionId = headers.get("mcp-session-id");
      let session = sessionId ? sessions.get(sessionId) : undefined;
      if (!session) {
        if (!isInitializeRequest(parsed)) {
          response.statusCode = sessionId ? 404 : 400;
          response.end();
          return;
        }
        session = await createUpstreamSession();
      }
      const webResponse = await session.transport.handleRequest(
        new Request(`${origin}/mcp`, {
          body: request.method === "GET" || request.method === "HEAD" ? undefined : raw,
          headers,
          method: request.method,
        }),
        { parsedBody: parsed },
      );
      if (hasPayment(parsed) && !droppedPaidResponse) {
        await webResponse.arrayBuffer();
        droppedPaidResponse = true;
        request.socket.destroy();
        return;
      }
      await writeWebResponse(webResponse, response);
      return;
    }
    response.statusCode = 404;
    response.end();
  } catch (error) {
    if (!response.headersSent) response.statusCode = 500;
    response.end();
    setImmediate(() => {
      throw error;
    });
  }
});

async function startCli() {
  const stderr = [];
  const transport = new StdioClientTransport({
    args: ["--upstream", `${origin}/mcp`],
    command: executable,
    cwd: consumerDirectory,
    env: definedEnvironment({
      ...process.env,
      TAB_ALLOW_DEVELOPMENT_LOOPBACK: "1",
      TAB_API_BASE_URL: origin,
      TAB_AGENT_KEY: testApiKey,
      TAB_STATE_DIRECTORY: stateDirectory,
    }),
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
  const client = new Client({ name: "packed-external-consumer", version: "1.0.0" });
  await client.connect(transport);
  let closed = false;
  return {
    client,
    async close() {
      if (closed) return;
      closed = true;
      await client.close();
      const output = Buffer.concat(stderr).toString("utf8");
      if (output) fail(`CLI wrote to stderr: ${output}`);
    },
  };
}

function verifyPaidResult(result) {
  if (result?.content?.[0]?.text !== "packed upstream paid result") {
    fail("restarted CLI did not return the paid upstream result");
  }
  const settlement = result?._meta?.[MCP_PAYMENT_RESPONSE_META_KEY];
  if (
    settlement?.success !== true ||
    settlement.network !== "eip155:84532" ||
    settlement.transaction !== testTransaction
  ) {
    fail("restarted CLI did not return settlement metadata");
  }
}

await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
const address = httpServer.address();
if (!address || typeof address === "string") fail("expected loopback listener");
origin = `http://127.0.0.1:${address.port}`;

const params = {
  _meta: { "tab/payment-idempotency-key": "packed-upstream-restart-1" },
  arguments: { query: "durable packed artifact" },
  name: "paid",
};
let activeCli;
try {
  activeCli = await startCli();
  let firstFailed = false;
  try {
    await activeCli.client.callTool(params);
  } catch {
    firstFailed = true;
  }
  if (!firstFailed || !droppedPaidResponse) fail("first paid upstream response was not lost");
  await activeCli.close();
  activeCli = await startCli();
  verifyPaidResult(await activeCli.client.callTool(params));
  await activeCli.close();
  activeCli = undefined;

  if (connectBodies.length !== 2 || challengeCount !== 1) {
    fail("restart did not resume the persisted payment directly");
  }
  if (signRequests.length !== 1) fail(`expected one signature, received ${signRequests.length}`);
  if (
    paidPayloadBytes.length !== 2 ||
    paidPayloadBytes[0] !== paidPayloadBytes[1] ||
    !isDeepStrictEqual(JSON.parse(paidPayloadBytes[0]), JSON.parse(paidPayloadBytes[1]))
  ) {
    fail("restart did not replay the exact MCP payment payload");
  }
  if (resultReports.length !== 1 || !observationAcknowledged) {
    fail("shutdown did not flush exactly one result observation");
  }
  if (
    resultReports[0]?.receiptId !== "packed-upstream-receipt-1" ||
    resultReports[0]?.paymentResponse?.transaction !== testTransaction
  ) {
    fail("result observation did not correlate to the signed payment");
  }
  process.stdout.write("packed upstream restart E2E verified\n");
} finally {
  await activeCli?.close().catch(() => undefined);
  await Promise.allSettled([...sessions.values()].map(({ server }) => server.close()));
  sessions.clear();
  await new Promise((resolve) => httpServer.close(resolve));
}
