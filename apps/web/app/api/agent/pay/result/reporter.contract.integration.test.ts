import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { TabRemoteSigner } from "@runtab/mcp";
import { NextRequest } from "next/server";
import { encodeAbiParameters, encodeEventTopics } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { issueLeashKey } from "../../../../../lib/auth/leash-key";
import { createDatabase } from "../../../../../lib/db/client";
import { agents, capCycles, receipts, users } from "../../../../../lib/db/schema";
import { closeServerDatabase } from "../../../../../lib/db/server";
import { POST } from "./route";
import { rpcBlock } from "./route.integration-support";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for reporter contract tests");
const connection = createDatabase(databaseUrl, 2);
const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const payTo = "0x1111111111111111111111111111111111111111";
const baseUsdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const nonce = `0x${"12".repeat(32)}` as const;
const transaction = `0x${"ab".repeat(32)}` as const;
const blockHash = `0x${"cd".repeat(32)}`;
const originalRpcUrl = process.env.BASE_RPC_URL;

const events = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
    name: "Transfer",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "authorizer", type: "address" },
      { indexed: true, name: "nonce", type: "bytes32" },
    ],
    name: "AuthorizationUsed",
    type: "event",
  },
] as const;

function rpcLog(topics: ReturnType<typeof encodeEventTopics>, data: `0x${string}`, index: string) {
  return {
    address: baseUsdc,
    blockHash,
    blockNumber: "0x1",
    data,
    logIndex: index,
    removed: false,
    topics: topics.map((topic) => {
      if (typeof topic !== "string") throw new Error("Expected encoded event topics");
      return topic;
    }),
    transactionHash: transaction,
    transactionIndex: "0x0",
  };
}

function rpcReceipt(includeAuthorization: boolean) {
  const transfer = rpcLog(
    encodeEventTopics({
      abi: events,
      args: { from: account.address, to: payTo },
      eventName: "Transfer",
    }),
    encodeAbiParameters([{ type: "uint256" }], [BigInt(25_000)]),
    "0x0",
  );
  const authorization = rpcLog(
    encodeEventTopics({
      abi: events,
      args: { authorizer: account.address, nonce },
      eventName: "AuthorizationUsed",
    }),
    "0x",
    "0x1",
  );
  return {
    blockHash,
    blockNumber: "0x1",
    contractAddress: null,
    cumulativeGasUsed: "0x5208",
    effectiveGasPrice: "0x1",
    from: "0x3333333333333333333333333333333333333333",
    gasUsed: "0x5208",
    logs: includeAuthorization ? [transfer, authorization] : [transfer],
    logsBloom: `0x${"00".repeat(256)}`,
    status: "0x1",
    to: baseUsdc,
    transactionHash: transaction,
    transactionIndex: "0x0",
    type: "0x2",
  };
}

async function requestBody(request: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

describe("agent reporter -> web settlement route contract", () => {
  let apiOrigin = "";
  let currentReceiptId = "";
  let includeAuthorization = false;
  const rpcServer = createServer(async (request, response) => {
    const body = JSON.parse(await requestBody(request));
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        id: body.id,
        jsonrpc: "2.0",
        result:
          body.method === "eth_chainId"
            ? "0x2105"
            : body.method === "eth_getBlockByNumber"
              ? rpcBlock(body.params[0] === "finalized" ? 2 : Number(BigInt(body.params[0])))
              : rpcReceipt(includeAuthorization),
      }),
    );
  });
  const apiServer = createServer(async (request, response) => {
    const body = await requestBody(request);
    if (request.url === "/api/agent/sign") {
      const parsed = JSON.parse(body);
      const signature = await account.signTypedData(parsed.signerRequest);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ receiptId: currentReceiptId, signature }));
      return;
    }
    if (request.url === "/api/agent/pay/result") {
      const routed = await POST(
        new NextRequest("http://localhost/api/agent/pay/result", {
          body,
          headers: {
            authorization: request.headers.authorization ?? "",
            "content-type": "application/json",
          },
          method: "POST",
        }),
      );
      response.statusCode = routed.status;
      response.setHeader("content-type", routed.headers.get("content-type") ?? "application/json");
      response.end(await routed.text());
      return;
    }
    response.statusCode = 404;
    response.end();
  });

  beforeAll(async () => {
    await new Promise<void>((resolve) => rpcServer.listen(0, "127.0.0.1", resolve));
    const rpcAddress = rpcServer.address();
    if (!rpcAddress || typeof rpcAddress === "string") throw new Error("Expected RPC listener");
    process.env.BASE_RPC_URL = `http://127.0.0.1:${rpcAddress.port}`;
    await new Promise<void>((resolve) => apiServer.listen(0, "127.0.0.1", resolve));
    const apiAddress = apiServer.address();
    if (!apiAddress || typeof apiAddress === "string") throw new Error("Expected API listener");
    apiOrigin = `http://127.0.0.1:${apiAddress.port}`;
  });

  beforeEach(async () => {
    currentReceiptId = "";
    includeAuthorization = false;
    await connection.client`truncate table users cascade`;
  });

  afterAll(async () => {
    if (originalRpcUrl === undefined) delete process.env.BASE_RPC_URL;
    else process.env.BASE_RPC_URL = originalRpcUrl;
    await closeServerDatabase();
    await connection.client.end();
    await Promise.all(
      [apiServer, rpcServer].map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
    );
  });

  it("retains correlation on 202 and clears it only after a verified 200", async () => {
    const [user] = await connection.db
      .insert(users)
      .values({ email: `${randomUUID()}@example.test`, magicIssuer: `did:ethr:${randomUUID()}` })
      .returning({ id: users.id });
    if (!user) throw new Error("Expected user");
    const [agent] = await connection.db
      .insert(agents)
      .values({
        agentAddress: account.address,
        name: "Reporter contract",
        ownerId: user.id,
        signerSubject: `leash:${randomUUID()}`,
      })
      .returning({ id: agents.id });
    if (!agent) throw new Error("Expected agent");
    const key = await issueLeashKey(connection.db, { agentId: agent.id });
    const [cycle] = await connection.db
      .insert(capCycles)
      .values({ agentId: agent.id, startedAt: new Date() })
      .returning({ id: capCycles.id });
    if (!cycle) throw new Error("Expected cycle");
    const validBefore = Math.floor(Date.now() / 1_000) + 300;
    const [receipt] = await connection.db
      .insert(receipts)
      .values({
        agentId: agent.id,
        amountAtomic: "25000",
        amountUsd: "0.025000",
        asset: baseUsdc,
        authorizationNonce: nonce,
        authorizationValidBefore: new Date(validBefore * 1_000),
        cycleId: cycle.id,
        network: "eip155:8453",
        payTo,
        requestFingerprint: randomBytes(32).toString("hex"),
      })
      .returning({ id: receipts.id });
    if (!receipt) throw new Error("Expected receipt");
    currentReceiptId = receipt.id;

    const signer = new TabRemoteSigner({
      address: account.address,
      apiBaseUrl: apiOrigin,
      apiKey: key.secret,
      fetch: globalThis.fetch,
      paymentProfile: "mainnet",
      reportRetryDelayMs: 1,
    });
    const signerRequest = {
      domain: { chainId: 8453, name: "USD Coin", verifyingContract: baseUsdc, version: "2" },
      message: {
        from: account.address,
        nonce,
        to: payTo,
        validAfter: BigInt(0),
        validBefore: BigInt(validBefore),
        value: BigInt(25_000),
      },
      primaryType: "TransferWithAuthorization",
      types: {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
    };
    const signature = await signer.signTypedData(signerRequest);
    const requirements = {
      amount: "25000",
      asset: baseUsdc,
      extra: { name: "USD Coin", version: "2" },
      maxTimeoutSeconds: 60,
      network: "eip155:8453",
      payTo,
      scheme: "exact",
    } as const;
    const context = {
      paymentPayload: { accepted: requirements, payload: { signature }, x402Version: 2 },
      requirements,
      settleResponse: {
        network: "eip155:8453",
        payer: account.address,
        success: true,
        transaction,
      },
    } satisfies Parameters<TabRemoteSigner["reportPaymentObservation"]>[0];

    await signer.reportPaymentObservation(context);
    await signer.flushPaymentObservations();
    expect(signer.receiptIdForSignature(signature)).toBe(receipt.id);
    expect(await connection.db.select({ status: receipts.status }).from(receipts)).toEqual([
      { status: "pending" },
    ]);

    includeAuthorization = true;
    await signer.reportPaymentObservation(context);
    await signer.flushPaymentObservations();
    expect(signer.receiptIdForSignature(signature)).toBeNull();
    expect(await connection.db.select({ status: receipts.status }).from(receipts)).toEqual([
      { status: "settled" },
    ]);
  });
});
