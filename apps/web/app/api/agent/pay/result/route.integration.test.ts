import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";

import { NextRequest } from "next/server";
import { encodeAbiParameters, encodeEventTopics } from "viem";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { issueLeashKey } from "../../../../../lib/auth/leash-key";
import { createDatabase } from "../../../../../lib/db/client";
import { agents, capCycles, receipts, users } from "../../../../../lib/db/schema";
import { closeServerDatabase } from "../../../../../lib/db/server";
import { POST } from "./route";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for pay-result route tests");
const connection = createDatabase(databaseUrl, 2);
const agentAddress = "0x2222222222222222222222222222222222222222";
const payTo = "0x1111111111111111111111111111111111111111";
const facilitator = "0x3333333333333333333333333333333333333333";
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
      args: { from: agentAddress, to: payTo },
      eventName: "Transfer",
    }),
    encodeAbiParameters([{ type: "uint256" }], [BigInt(25_000)]),
    "0x0",
  );
  const authorization = rpcLog(
    encodeEventTopics({
      abi: events,
      args: { authorizer: agentAddress, nonce },
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
    from: facilitator,
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

async function provision() {
  const [user] = await connection.db
    .insert(users)
    .values({ email: `${randomUUID()}@example.test`, magicIssuer: `did:ethr:${randomUUID()}` })
    .returning({ id: users.id });
  if (!user) throw new Error("Expected user");
  const [agent] = await connection.db
    .insert(agents)
    .values({
      agentAddress,
      name: "Result route",
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
  const [receipt] = await connection.db
    .insert(receipts)
    .values({
      agentId: agent.id,
      amountAtomic: "25000",
      amountUsd: "0.025000",
      asset: baseUsdc,
      authorizationNonce: nonce,
      authorizationValidBefore: new Date(Date.now() + 300_000),
      cycleId: cycle.id,
      network: "eip155:8453",
      payTo,
      requestFingerprint: randomBytes(32).toString("hex"),
    })
    .returning({ id: receipts.id });
  if (!receipt) throw new Error("Expected receipt");
  return { agentId: agent.id, receiptId: receipt.id, secret: key.secret };
}

function observation(receiptId: string) {
  return {
    outcome: "observed",
    paymentResponse: {
      network: "eip155:8453",
      payer: agentAddress,
      success: true,
      transaction,
    },
    receiptId,
  };
}

function request(secret: string | null, body: unknown) {
  return new NextRequest("http://localhost/api/agent/pay/result", {
    body: JSON.stringify(body),
    headers: {
      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      "content-type": "application/json",
    },
    method: "POST",
  });
}

describe("POST /api/agent/pay/result", () => {
  let includeAuthorization = false;
  const server = createServer(async (incoming, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({ id: body.id, jsonrpc: "2.0", result: rpcReceipt(includeAuthorization) }),
    );
  });

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP listener");
    process.env.BASE_RPC_URL = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(async () => {
    includeAuthorization = false;
    await connection.client`truncate table users cascade`;
  });

  afterAll(async () => {
    if (originalRpcUrl === undefined) delete process.env.BASE_RPC_URL;
    else process.env.BASE_RPC_URL = originalRpcUrl;
    await closeServerDatabase();
    await connection.client.end();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("uses a generic 401 and rejects client-declared failure without releasing pending spend", async () => {
    const pending = await provision();
    expect((await POST(request(null, observation(pending.receiptId)))).status).toBe(401);

    const response = await POST(
      request(pending.secret, { outcome: "failed", receiptId: pending.receiptId }),
    );
    expect(response.status).toBe(400);
    const [stored] = await connection.db.select({ status: receipts.status }).from(receipts);
    expect(stored?.status).toBe("pending");
  });

  it("keeps a resource claim pending when the exact authorization-use proof is absent", async () => {
    const pending = await provision();
    const response = await POST(request(pending.secret, observation(pending.receiptId)));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      receiptId: pending.receiptId,
      status: "pending",
      verified: false,
    });
  });

  it("settles from real RPC proof and handles the same callback idempotently", async () => {
    const pending = await provision();
    includeAuthorization = true;

    const first = await POST(request(pending.secret, observation(pending.receiptId)));
    const second = await POST(request(pending.secret, observation(pending.receiptId)));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const [stored] = await connection.db
      .select({ status: receipts.status, txHash: receipts.txHash })
      .from(receipts);
    expect(stored).toEqual({ status: "settled", txHash: transaction });
  });
});
