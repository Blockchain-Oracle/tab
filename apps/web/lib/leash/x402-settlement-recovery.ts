import type { SettleResponse } from "@x402/core/types";
import { createPublicClient, http, parseAbiItem } from "viem";
import { baseSepolia } from "viem/chains";

import type { DurableX402Attempt } from "./x402-settlement-attempt-store";
import { verifySuccessfulSettlementProof } from "./x402-settlement-proof";
import type { X402TestnetSettlement } from "./x402-testnet-resource";

const AUTHORIZATION_USED = parseAbiItem(
  "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)",
);

export class X402SettlementRpcError extends Error {
  readonly code: "RPC_CHAIN_MISMATCH" | "RPC_UNAVAILABLE";

  constructor(code: X402SettlementRpcError["code"]) {
    super(
      code === "RPC_CHAIN_MISMATCH"
        ? "The x402 settlement RPC is on the wrong chain."
        : "The x402 settlement RPC is unavailable.",
    );
    this.code = code;
    this.name = "X402SettlementRpcError";
  }
}

function client(rpcUrl: string) {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl, {
      maxResponseBodySize: 1_048_576,
      retryCount: 0,
      timeout: 5_000,
    }),
  });
}

export async function readX402SettlementStartBlock(rpcUrl: string) {
  try {
    const publicClient = client(rpcUrl);
    if ((await publicClient.getChainId()) !== baseSepolia.id) {
      throw new X402SettlementRpcError("RPC_CHAIN_MISMATCH");
    }
    return (await publicClient.getBlock({ blockTag: "finalized" })).number;
  } catch (error) {
    if (error instanceof X402SettlementRpcError) throw error;
    throw new X402SettlementRpcError("RPC_UNAVAILABLE");
  }
}

export type X402AttemptRecovery =
  | { settlement: X402TestnetSettlement; status: "verified" }
  | { reason: "receipt_not_propagated" | "rpc_unavailable"; status: "retryable" }
  | { status: "pending" }
  | { status: "expired_unused" }
  | { status: "invalid" };

export async function recoverX402SettlementAttempt(
  attempt: DurableX402Attempt,
  rpcUrl: string,
): Promise<X402AttemptRecovery> {
  const publicClient = client(rpcUrl);
  try {
    if ((await publicClient.getChainId()) !== baseSepolia.id) return { status: "invalid" };
    const finalized = await publicClient.getBlock({ blockTag: "finalized" });
    const startBlock = BigInt(attempt.startBlock);
    if (startBlock > finalized.number) return { status: "pending" };
    const logs = await publicClient.getLogs({
      address: attempt.asset,
      args: { authorizer: attempt.payer, nonce: attempt.nonce },
      event: AUTHORIZATION_USED,
      fromBlock: startBlock,
      strict: true,
      toBlock: finalized.number,
    });
    if (logs.length > 1) return { status: "invalid" };
    const transactionHash = logs[0]?.transactionHash;
    if (!transactionHash) {
      const validBefore = BigInt(attempt.authorizationValidBefore);
      return finalized.timestamp >= validBefore
        ? { status: "expired_unused" }
        : { status: "pending" };
    }
    const facilitatorResponse = {
      amount: attempt.amount,
      network: attempt.network,
      payer: attempt.payer,
      success: true,
      tabEvidenceSource: "independent_chain_recovery",
      transaction: transactionHash,
    } as SettleResponse;
    const settlement: X402TestnetSettlement = {
      amount: attempt.amount,
      asset: attempt.asset,
      authorizationValidAfter: attempt.authorizationValidAfter,
      authorizationValidBefore: attempt.authorizationValidBefore,
      endpoint: attempt.endpoint,
      facilitatorResponse,
      facilitatorUrl: attempt.facilitatorUrl,
      network: attempt.network,
      nonce: attempt.nonce,
      payee: attempt.payee,
      payer: attempt.payer,
      testFunds: true,
      transactionHash,
    };
    const proof = await verifySuccessfulSettlementProof({
      amountAtomic: settlement.amount,
      asset: settlement.asset,
      network: settlement.network,
      nonce: settlement.nonce,
      payee: settlement.payee,
      payer: settlement.payer,
      rpcUrl,
      transactionHash,
    });
    if (proof.status === "verified") return { settlement, status: "verified" };
    if (proof.status === "retryable") return proof;
    return { status: "invalid" };
  } catch {
    return { reason: "rpc_unavailable", status: "retryable" };
  }
}
