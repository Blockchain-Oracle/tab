import { spawn } from "node:child_process";
import { createServer } from "node:http";

import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import { privateKeyToAccount } from "viem/accounts";

const [executable, consumerDirectory, stateDirectory] = process.argv.slice(2);
if (!executable || !consumerDirectory || !stateDirectory) {
  throw new Error("packed paid E2E requires executable, consumer, and state paths");
}

const account = privateKeyToAccount(`0x${"31".repeat(32)}`);
const apiKey = `leash_sk_${"p".repeat(43)}`;
const transaction = `0x${"ab".repeat(32)}`;
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
  resource: { url: "http://127.0.0.1/paid" },
  x402Version: 2,
};
const paymentHeaders = [];
const resultReports = [];
const signRequests = [];

function fail(message) {
  throw new Error(`packed paid E2E failed: ${message}`);
}

async function jsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function mcpProcess(origin) {
  const child = spawn(executable, [], {
    cwd: consumerDirectory,
    env: {
      ...process.env,
      LEASH_ALLOW_DEVELOPMENT_LOOPBACK: "1",
      LEASH_API_BASE_URL: origin,
      LEASH_API_KEY: apiKey,
      LEASH_STATE_DIRECTORY: stateDirectory,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let buffer = "";
  let nextId = 1;
  let stderr = "";
  const pending = new Map();
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    while (buffer.includes("\n")) {
      const newline = buffer.indexOf("\n");
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        fail("CLI wrote non-JSON protocol output");
      }
      if (message.id !== undefined && pending.has(message.id)) {
        const settle = pending.get(message.id);
        pending.delete(message.id);
        settle(message);
      }
    }
  });
  child.once("exit", (code) => {
    for (const settle of pending.values()) {
      settle({ error: { code: -1, message: `CLI exited ${code}: ${stderr}` } });
    }
    pending.clear();
  });

  const send = (method, params) => {
    const id = nextId;
    nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP ${method} timed out: ${stderr}`));
      }, 15_000);
      pending.set(id, (message) => {
        clearTimeout(timer);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      });
      child.stdin.write(`${JSON.stringify({ id, jsonrpc: "2.0", method, params })}\n`);
    });
  };

  return {
    async close() {
      child.stdin.end();
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error(`CLI did not exit cleanly: ${stderr}`));
        }, 10_000);
        child.once("exit", (code) => {
          clearTimeout(timer);
          if (code === 0 || code === null) resolve();
          else reject(new Error(`CLI exited ${code}: ${stderr}`));
        });
      });
      if (stderr) fail(`CLI wrote to stderr: ${stderr}`);
    },
    async initialize() {
      await send("initialize", {
        capabilities: {},
        clientInfo: { name: "packed-consumer", version: "1.0.0" },
        protocolVersion: "2025-06-18",
      });
      child.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
      );
    },
    send,
  };
}

function toolJson(result) {
  const content = result?.content?.[0];
  if (content?.type !== "text") fail("paid_fetch did not return text content");
  return JSON.parse(content.text);
}

const server = createServer(async (request, response) => {
  if (request.url === "/api/agent/connect") {
    await jsonBody(request);
    if (request.headers.authorization !== `Bearer ${apiKey}`) fail("connect auth mismatch");
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({ agent: { address: account.address }, paymentProfile: "mainnet" }),
    );
    return;
  }
  if (request.url === "/api/agent/sign") {
    const body = await jsonBody(request);
    signRequests.push(body);
    const signature = await account.signTypedData(body.signerRequest);
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ receiptId: "packed-receipt-1", signature }));
    return;
  }
  if (request.url === "/api/agent/pay/result") {
    resultReports.push(await jsonBody(request));
    response.statusCode = 204;
    response.end();
    return;
  }
  if (request.url === "/paid") {
    const payment = request.headers["payment-signature"];
    if (typeof payment !== "string") {
      response.statusCode = 402;
      response.setHeader("PAYMENT-REQUIRED", encodePaymentRequiredHeader(paymentRequired));
      response.end("payment required");
      return;
    }
    paymentHeaders.push(payment);
    if (paymentHeaders.length === 1) {
      request.socket.destroy();
      return;
    }
    response.setHeader(
      "PAYMENT-RESPONSE",
      encodePaymentResponseHeader({
        network: "eip155:8453",
        payer: account.address,
        success: true,
        transaction,
      }),
    );
    response.end("packed paid result");
    return;
  }
  response.statusCode = 404;
  response.end();
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") fail("expected loopback listener");
const origin = `http://127.0.0.1:${address.port}`;
paymentRequired.resource.url = `${origin}/paid`;

try {
  const first = mcpProcess(origin);
  await first.initialize();
  const failed = await first.send("tools/call", {
    arguments: { idempotencyKey: "packed-restart-1", url: `${origin}/paid` },
    name: "paid_fetch",
  });
  if (!failed.isError || toolJson(failed).error?.code !== "FETCH_FAILED") {
    fail("first lost response did not fail honestly");
  }
  await first.close();

  const restarted = mcpProcess(origin);
  await restarted.initialize();
  const recovered = await restarted.send("tools/call", {
    arguments: { idempotencyKey: "packed-restart-1", url: `${origin}/paid` },
    name: "paid_fetch",
  });
  const body = toolJson(recovered);
  if (recovered.isError || body.status !== 200 || body.body !== "packed paid result") {
    fail("restarted paid_fetch did not recover the protected response");
  }
  await restarted.close();

  if (signRequests.length !== 1) fail(`expected one signature, received ${signRequests.length}`);
  if (paymentHeaders.length !== 2 || paymentHeaders[0] !== paymentHeaders[1]) {
    fail("restart did not replay the exact payment header");
  }
  const payload = decodePaymentSignatureHeader(paymentHeaders[0]);
  if (payload.payload.signature !== (await account.signTypedData(signRequests[0].signerRequest))) {
    fail("persisted payment header does not contain the signed payload");
  }
  if (resultReports.length !== 1 || resultReports[0].receiptId !== "packed-receipt-1") {
    fail("settlement observation was not flushed on shutdown");
  }
  process.stdout.write("packed paid_fetch restart E2E verified\n");
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
