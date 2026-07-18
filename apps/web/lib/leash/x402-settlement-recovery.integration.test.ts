import { createServer } from "node:http";
import { format } from "node:util";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  agentAddress,
  baseSepoliaUsdc,
  nonce,
  payTo,
  validReceipt,
} from "./settlement-evidence.integration-support";
import type { DurableX402Attempt } from "./x402-settlement-attempt-store";
import {
  readX402SettlementStartBlock,
  recoverX402SettlementAttempt,
} from "./x402-settlement-recovery";

const blockHash = `0x${"cd".repeat(32)}`;
const zeroHash = `0x${"00".repeat(32)}`;

function block(timestamp = 2_000_000_016, number = 256, hash: string = blockHash) {
  return {
    baseFeePerGas: "0x1",
    difficulty: "0x0",
    extraData: "0x",
    gasLimit: "0x1c9c380",
    gasUsed: "0x5208",
    hash,
    logsBloom: `0x${"00".repeat(256)}`,
    miner: "0x3333333333333333333333333333333333333333",
    mixHash: zeroHash,
    nonce: "0x0000000000000000",
    number: `0x${number.toString(16)}`,
    parentHash: zeroHash,
    receiptsRoot: zeroHash,
    sha3Uncles: zeroHash,
    size: "0x1",
    stateRoot: zeroHash,
    timestamp: `0x${timestamp.toString(16)}`,
    totalDifficulty: "0x0",
    transactions: [],
    transactionsRoot: zeroHash,
    uncles: [],
  };
}

function attempt(): DurableX402Attempt {
  return {
    amount: "1000",
    asset: baseSepoliaUsdc,
    authorizationValidAfter: "0",
    authorizationValidBefore: "2000000000",
    endpoint: "https://tab.example/api/x402/testnet",
    facilitatorResponse: null,
    facilitatorUrl: "https://x402.org/facilitator",
    network: "eip155:84532",
    nonce,
    payee: payTo,
    payer: agentAddress,
    paymentFingerprint: "1".repeat(64),
    startBlock: "0",
    testFunds: true,
    transactionHash: null,
  };
}

describe("crash-ambiguous x402 settlement recovery", () => {
  let authorizationLogs: unknown[] = [];
  let canonicalReceiptBlockHash = blockHash;
  let failRpc = false;
  let finalizedBlockNumber = 256;
  let rpcUrl = "";
  const rpcRequests: Array<{ method: string; params: unknown[] }> = [];
  const receipt = validReceipt(baseSepoliaUsdc, BigInt(1_000));
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    rpcRequests.push(body);
    const results: Record<string, unknown> = {
      eth_chainId: "0x14a34",
      eth_getBlockByNumber:
        body.method !== "eth_getBlockByNumber"
          ? null
          : body.params[0] === "finalized" || body.params[0] === "latest"
            ? block(2_000_000_016, finalizedBlockNumber, `0x${"ef".repeat(32)}`)
            : block(2_000_000_016, Number(BigInt(body.params[0])), canonicalReceiptBlockHash),
      eth_getLogs: authorizationLogs,
      eth_getTransactionReceipt: receipt,
    };
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify(
        failRpc
          ? { error: { code: -32_000, message: "offline" }, id: body.id, jsonrpc: "2.0" }
          : { id: body.id, jsonrpc: "2.0", result: results[body.method] },
      ),
    );
  });

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP listener");
    rpcUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    authorizationLogs = [receipt.logs[1]];
    canonicalReceiptBlockHash = blockHash;
    failRpc = false;
    finalizedBlockNumber = 256;
    rpcRequests.length = 0;
  });

  afterAll(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );

  it("finds AuthorizationUsed and independently proves the exact transfer", async () => {
    await expect(recoverX402SettlementAttempt(attempt(), rpcUrl)).resolves.toMatchObject({
      settlement: {
        facilitatorResponse: { tabEvidenceSource: "independent_chain_recovery" },
        transactionHash: receipt.transactionHash,
      },
      status: "verified",
    });
    expect(
      rpcRequests.filter((request) => request.method === "eth_getBlockByNumber")[0]?.params[0],
    ).toBe("finalized");
    expect(
      rpcRequests.find((request) => request.method === "eth_getLogs")?.params[0],
    ).toMatchObject({ fromBlock: "0x0", toBlock: "0x100" });
  });

  it("anchors the durable recovery scan at the finalized head", async () => {
    await expect(readX402SettlementStartBlock(rpcUrl)).resolves.toBe(BigInt(256));
    expect(rpcRequests.map(({ method }) => method)).toEqual([
      "eth_chainId",
      "eth_getBlockByNumber",
    ]);
    expect(rpcRequests[1]?.params[0]).toBe("finalized");
  });

  it("does not recover an AuthorizationUsed event above the finalized head", async () => {
    finalizedBlockNumber = 0;

    await expect(recoverX402SettlementAttempt(attempt(), rpcUrl)).resolves.toEqual({
      reason: "receipt_not_propagated",
      status: "retryable",
    });
  });

  it("does not recover a receipt from a non-canonical block hash", async () => {
    canonicalReceiptBlockHash = `0x${"34".repeat(32)}`;

    await expect(recoverX402SettlementAttempt(attempt(), rpcUrl)).resolves.toEqual({
      reason: "receipt_not_propagated",
      status: "retryable",
    });
  });

  it("distinguishes an expired unused authorization from RPC uncertainty", async () => {
    authorizationLogs = [];
    await expect(recoverX402SettlementAttempt(attempt(), rpcUrl)).resolves.toEqual({
      status: "expired_unused",
    });

    failRpc = true;
    await expect(recoverX402SettlementAttempt(attempt(), rpcUrl)).resolves.toEqual({
      reason: "rpc_unavailable",
      status: "retryable",
    });
  });

  it("never exposes RPC URL credentials through the settlement error boundary", async () => {
    const credential = "rpc-query-credential-must-not-leak";
    failRpc = true;

    let thrown: unknown;
    try {
      await readX402SettlementStartBlock(`${rpcUrl}?apiKey=${credential}`);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const logged: string[] = [];
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation((...values: unknown[]) => logged.push(format(...values)));
    console.error("Settlement failed:", thrown);
    errorLog.mockRestore();

    const apiOutput = JSON.stringify({ error: thrown });
    expect(String(thrown)).toBe("X402SettlementRpcError: The x402 settlement RPC is unavailable.");
    expect(`${logged.join("\n")}\n${apiOutput}`).not.toContain(credential);
  });
});
