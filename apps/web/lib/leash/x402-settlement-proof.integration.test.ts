import { createServer } from "node:http";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  agentAddress,
  baseSepoliaUsdc,
  nonce,
  payTo,
  transaction,
  validReceipt,
} from "./settlement-evidence.integration-support";
import { verifySuccessfulSettlementProof } from "./x402-settlement-proof";

describe("tri-state seller settlement proof", () => {
  const finalizedHash = `0x${"ef".repeat(32)}`;
  const zeroHash = `0x${"00".repeat(32)}`;
  let chainId = "0x14a34";
  let canonicalReceiptBlockHash = `0x${"cd".repeat(32)}`;
  let finalizedBlockNumber = 2;
  let oversizedChainResponse = false;
  let receipt: ReturnType<typeof validReceipt> | null = validReceipt(baseSepoliaUsdc);
  let rpcFailure = false;
  let rpcResponseDelayMs = 0;
  let rpcUrl = "";

  function block(number: number, hash: string) {
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
      timestamp: "0x77359400",
      totalDifficulty: "0x0",
      transactions: [],
      transactionsRoot: zeroHash,
      uncles: [],
    };
  }

  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (rpcResponseDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, rpcResponseDelayMs));
    }
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify(
        rpcFailure
          ? {
              error: { code: -32_000, message: "temporarily unavailable" },
              id: body.id,
              jsonrpc: "2.0",
            }
          : {
              id: body.id,
              jsonrpc: "2.0",
              result:
                body.method === "eth_chainId"
                  ? oversizedChainResponse
                    ? "0x".padEnd(1_100_000, "1")
                    : chainId
                  : body.method === "eth_getBlockByNumber"
                    ? body.params[0] === "finalized"
                      ? block(finalizedBlockNumber, finalizedHash)
                      : block(Number(BigInt(body.params[0])), canonicalReceiptBlockHash)
                    : receipt,
            },
      ),
    );
  });

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP listener");
    rpcUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    chainId = "0x14a34";
    canonicalReceiptBlockHash = `0x${"cd".repeat(32)}`;
    finalizedBlockNumber = 2;
    oversizedChainResponse = false;
    receipt = validReceipt(baseSepoliaUsdc);
    rpcFailure = false;
    rpcResponseDelayMs = 0;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  const expected = () => ({
    amountAtomic: "25000",
    asset: baseSepoliaUsdc,
    network: "eip155:84532" as const,
    nonce,
    payee: payTo,
    payer: agentAddress,
    rpcUrl,
    transactionHash: transaction,
  });

  it("verifies the exact successful Circle USDC proof", async () => {
    await expect(verifySuccessfulSettlementProof(expected())).resolves.toEqual({
      status: "verified",
    });
  });

  it("keeps a latest-only receipt retryable until its block is finalized", async () => {
    finalizedBlockNumber = 0;

    await expect(verifySuccessfulSettlementProof(expected())).resolves.toEqual({
      reason: "receipt_not_propagated",
      status: "retryable",
    });
  });

  it("rejects a stale receipt whose block hash is not canonical", async () => {
    canonicalReceiptBlockHash = `0x${"34".repeat(32)}`;

    await expect(verifySuccessfulSettlementProof(expected())).resolves.toEqual({
      reason: "receipt_not_propagated",
      status: "retryable",
    });
  });

  it("requires both settlement logs to belong to the finalized canonical receipt", async () => {
    if (!receipt) throw new Error("Expected receipt fixture");
    const transfer = receipt.logs[0];
    if (!transfer) throw new Error("Expected transfer log fixture");
    receipt.logs[0] = { ...transfer, blockHash: `0x${"56".repeat(32)}` };

    await expect(verifySuccessfulSettlementProof(expected())).resolves.toEqual({
      reason: "missing_transfer",
      status: "invalid",
    });
  });

  it("distinguishes an unpropagated receipt and unavailable RPC as retryable", async () => {
    receipt = null;
    await expect(verifySuccessfulSettlementProof(expected())).resolves.toEqual({
      reason: "receipt_not_propagated",
      status: "retryable",
    });

    rpcFailure = true;
    await expect(verifySuccessfulSettlementProof(expected())).resolves.toEqual({
      reason: "rpc_unavailable",
      status: "retryable",
    });
  });

  it("fails closed on oversized or timed-out trusted RPC responses", async () => {
    oversizedChainResponse = true;
    await expect(verifySuccessfulSettlementProof(expected())).resolves.toEqual({
      reason: "rpc_unavailable",
      status: "retryable",
    });

    oversizedChainResponse = false;
    rpcResponseDelayMs = 100;
    await expect(
      verifySuccessfulSettlementProof({ ...expected(), rpcTimeoutMs: 20 }),
    ).resolves.toEqual({ reason: "rpc_unavailable", status: "retryable" });
  });

  it("classifies a wrong chain or definitive receipt mismatch as invalid", async () => {
    chainId = "0x2105";
    await expect(verifySuccessfulSettlementProof(expected())).resolves.toEqual({
      reason: "wrong_chain",
      status: "invalid",
    });

    chainId = "0x14a34";
    receipt = validReceipt(baseSepoliaUsdc);
    receipt.logs = receipt.logs.slice(0, 1);
    await expect(verifySuccessfulSettlementProof(expected())).resolves.toEqual({
      reason: "missing_authorization_used",
      status: "invalid",
    });
  });
});
