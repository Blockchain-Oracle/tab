import { createServer } from "node:http";

import { encodeAbiParameters, encodeEventTopics } from "viem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  InvalidSettlementObservationError,
  parseSettlementObservation,
  verifySettlementOnchain,
} from "./settlement-evidence";
import {
  agentAddress,
  authorizationValidBefore,
  facilitator,
  failedObservedResult,
  nonce,
  observedResult,
  payTo,
  revertedTransaction,
  rpcLog,
  settlementEvents,
  transaction,
  validFailedInput,
  validReceipt,
} from "./settlement-evidence.integration-support";

describe("settlement observation and on-chain proof", () => {
  let rpcUrl = "";
  let receipt = validReceipt();
  let rpcTransaction = revertedTransaction();
  const rpcMethods: string[] = [];
  function expected(overrides: { agentAddress?: string } = {}) {
    return {
      agentAddress: overrides.agentAddress ?? agentAddress,
      amountAtomic: "25000",
      authorizationNonce: nonce,
      authorizationValidBefore,
      network: "eip155:8453",
      payTo,
      rpcUrl,
    };
  }
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    rpcMethods.push(body.method);
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        id: body.id,
        jsonrpc: "2.0",
        result: body.method === "eth_getTransactionByHash" ? rpcTransaction : receipt,
      }),
    );
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

  it("parses a failed x402 settle response only when it carries a real hash and reason", () => {
    expect(parseSettlementObservation(failedObservedResult())).toMatchObject({
      errorReason: "invalid_exact_evm_transaction_failed",
      success: false,
      transaction,
    });
    for (const paymentResponse of [
      { ...failedObservedResult().paymentResponse, transaction: "" },
      { ...failedObservedResult().paymentResponse, errorReason: undefined },
      { ...failedObservedResult().paymentResponse, errorMessage: null },
    ]) {
      expect(() => parseSettlementObservation(failedObservedResult({ paymentResponse }))).toThrow(
        InvalidSettlementObservationError,
      );
    }
  });

  it("proves a reverted hash belongs to the reserved EIP-3009 authorization", async () => {
    receipt = { ...validReceipt(), logs: [], status: "0x0" };
    rpcTransaction = revertedTransaction();
    const evidence = parseSettlementObservation(failedObservedResult());

    await expect(verifySettlementOnchain(evidence, expected())).resolves.toBe(true);
    expect(rpcMethods.slice(-2)).toEqual(["eth_getTransactionReceipt", "eth_getTransactionByHash"]);

    for (const input of [
      validFailedInput({ payTo: "0x4444444444444444444444444444444444444444" }),
      validFailedInput({ validAfter: BigInt(1) }),
      validFailedInput({ validBefore: BigInt(2_000_000_001) }),
    ]) {
      rpcTransaction = revertedTransaction(input);
      await expect(verifySettlementOnchain(evidence, expected())).resolves.toBe(false);
    }
  });

  it("proves the exact native-USDC transfer and authorization nonce over real viem RPC", async () => {
    receipt = validReceipt();
    const evidence = parseSettlementObservation(observedResult());

    await expect(verifySettlementOnchain(evidence, expected())).resolves.toBe(true);
    expect(rpcMethods.at(-1)).toBe("eth_getTransactionReceipt");
  });

  it("keeps a proven match when a later unrelated USDC log is present", async () => {
    receipt = validReceipt();
    receipt.logs.push(
      rpcLog(
        encodeEventTopics({
          abi: settlementEvents,
          args: { from: facilitator, to: payTo },
          eventName: "Transfer",
        }),
        encodeAbiParameters([{ type: "uint256" }], [BigInt(1)]),
        "0x2",
      ),
    );

    await expect(
      verifySettlementOnchain(parseSettlementObservation(observedResult()), expected()),
    ).resolves.toBe(true);
  });

  it("keeps a shaped resource claim unproven without its matching nonce-use log", async () => {
    const withoutAuthorization = validReceipt();
    withoutAuthorization.logs = withoutAuthorization.logs.slice(0, 1);
    receipt = withoutAuthorization;

    await expect(
      verifySettlementOnchain(parseSettlementObservation(observedResult()), expected()),
    ).resolves.toBe(false);
  });

  it("rejects an observation that conflicts with the reserved payer or network before RPC", async () => {
    const before = rpcMethods.length;
    await expect(
      verifySettlementOnchain(
        parseSettlementObservation(observedResult()),
        expected({ agentAddress: "0x4444444444444444444444444444444444444444" }),
      ),
    ).resolves.toBe(false);
    expect(rpcMethods).toHaveLength(before);
  });
});
