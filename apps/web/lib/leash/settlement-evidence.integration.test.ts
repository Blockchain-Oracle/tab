import { createServer } from "node:http";

import { encodeAbiParameters, encodeEventTopics } from "viem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  InvalidSettlementObservationError,
  parseSettlementObservation,
  verifySettlementOnchain,
} from "./settlement-evidence";

const agentAddress = "0x2222222222222222222222222222222222222222";
const payTo = "0x1111111111111111111111111111111111111111";
const facilitator = "0x3333333333333333333333333333333333333333";
const baseUsdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const transaction = `0x${"ab".repeat(32)}` as const;
const nonce = `0x${"12".repeat(32)}` as const;
const blockHash = `0x${"cd".repeat(32)}`;

const settlementEvents = [
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

function observedResult(overrides: Record<string, unknown> = {}) {
  return {
    outcome: "observed",
    paymentResponse: {
      network: "eip155:8453",
      payer: agentAddress,
      success: true,
      transaction,
    },
    receiptId: "550e8400-e29b-41d4-a716-446655440000",
    ...overrides,
  };
}

function rpcLog(
  topics: ReturnType<typeof encodeEventTopics>,
  data: `0x${string}`,
  logIndex: string,
) {
  return {
    address: baseUsdc,
    blockHash,
    blockNumber: "0x1",
    data,
    logIndex,
    removed: false,
    topics: topics.map((topic) => {
      if (typeof topic !== "string") throw new Error("Expected fully encoded event topics");
      return topic;
    }),
    transactionHash: transaction,
    transactionIndex: "0x0",
  };
}

function validReceipt() {
  const transferTopics = encodeEventTopics({
    abi: settlementEvents,
    args: { from: agentAddress, to: payTo },
    eventName: "Transfer",
  });
  const authorizationTopics = encodeEventTopics({
    abi: settlementEvents,
    args: { authorizer: agentAddress, nonce },
    eventName: "AuthorizationUsed",
  });
  return {
    blockHash,
    blockNumber: "0x1",
    contractAddress: null,
    cumulativeGasUsed: "0x5208",
    effectiveGasPrice: "0x1",
    from: facilitator,
    gasUsed: "0x5208",
    logs: [
      rpcLog(transferTopics, encodeAbiParameters([{ type: "uint256" }], [BigInt(25_000)]), "0x0"),
      rpcLog(authorizationTopics, "0x", "0x1"),
    ],
    logsBloom: `0x${"00".repeat(256)}`,
    status: "0x1",
    to: baseUsdc,
    transactionHash: transaction,
    transactionIndex: "0x0",
    type: "0x2",
  };
}

describe("settlement observation and on-chain proof", () => {
  let rpcUrl = "";
  let receipt = validReceipt();
  const rpcMethods: string[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    rpcMethods.push(body.method);
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ id: body.id, jsonrpc: "2.0", result: receipt }));
  });

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP listener");
    rpcUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("parses only a canonical untrusted observation, never a settled claim", () => {
    expect(parseSettlementObservation(observedResult())).toMatchObject({
      network: "eip155:8453",
      payer: agentAddress,
      receiptId: "550e8400-e29b-41d4-a716-446655440000",
      transaction,
    });
    expect(() => parseSettlementObservation(observedResult({ outcome: "settled" }))).toThrow(
      InvalidSettlementObservationError,
    );
  });

  it("proves the exact native-USDC transfer and authorization nonce over real viem RPC", async () => {
    receipt = validReceipt();
    const evidence = parseSettlementObservation(observedResult());

    await expect(
      verifySettlementOnchain(evidence, {
        agentAddress,
        amountAtomic: "25000",
        authorizationNonce: nonce,
        network: "eip155:8453",
        payTo,
        rpcUrl,
      }),
    ).resolves.toBe(true);
    expect(rpcMethods.at(-1)).toBe("eth_getTransactionReceipt");
  });

  it("keeps a shaped resource claim unproven without its matching nonce-use log", async () => {
    const withoutAuthorization = validReceipt();
    withoutAuthorization.logs = withoutAuthorization.logs.slice(0, 1);
    receipt = withoutAuthorization;

    await expect(
      verifySettlementOnchain(parseSettlementObservation(observedResult()), {
        agentAddress,
        amountAtomic: "25000",
        authorizationNonce: nonce,
        network: "eip155:8453",
        payTo,
        rpcUrl,
      }),
    ).resolves.toBe(false);
  });

  it("rejects an observation that conflicts with the reserved payer or network before RPC", async () => {
    const before = rpcMethods.length;
    await expect(
      verifySettlementOnchain(parseSettlementObservation(observedResult()), {
        agentAddress: "0x4444444444444444444444444444444444444444",
        amountAtomic: "25000",
        authorizationNonce: nonce,
        network: "eip155:8453",
        payTo,
        rpcUrl,
      }),
    ).resolves.toBe(false);
    expect(rpcMethods).toHaveLength(before);
  });
});
