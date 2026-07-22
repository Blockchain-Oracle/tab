import { createPublicClient, erc20Abi, http, parseEventLogs } from "viem";
import { baseSepolia } from "viem/chains";

/**
 * Real Base Sepolia settlement verification for test-env payments: the
 * reported transaction must be a successful USDC Transfer from the buyer to
 * the merchant for the exact intent amount. No finality wait — checkout
 * verification is latency-sensitive; the deliberate FINALIZED gate in
 * x402-settlement-proof.ts is for the agent rail, not here.
 */

export class TestVerificationUnavailableError extends Error {
  readonly code = "TEST_VERIFICATION_UNAVAILABLE";

  constructor() {
    super("Base Sepolia verification is temporarily unavailable.");
    this.name = "TestVerificationUnavailableError";
  }
}

export interface TestTransferInput {
  amountAtomic: string;
  payerAddress: string;
  receiver: string;
  tokenAddress: string;
  transactionId: string;
}

export type TestTransferVerdict =
  | { outcome: "invalid"; reason: string }
  | { outcome: "retryable" }
  | {
      outcome: "verified";
      tokenChanges: [
        { amountAtomic: string; chainId: number; receiver: string; tokenAddress: string },
      ];
      txHash: string;
    };

export type TestTransferVerifier = (input: TestTransferInput) => Promise<TestTransferVerdict>;

function rpcClient() {
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL;
  if (!rpcUrl?.trim()) throw new TestVerificationUnavailableError();
  return createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
}

export async function verifyTestTransfer(input: TestTransferInput): Promise<TestTransferVerdict> {
  const client = rpcClient();

  let receipt: Awaited<ReturnType<typeof client.getTransactionReceipt>>;
  try {
    receipt = await client.getTransactionReceipt({
      hash: input.transactionId as `0x${string}`,
    });
  } catch (error) {
    // Not yet indexed (or still pending) — the SDK retries the report.
    if (error instanceof Error && /not.*found|could not be found/i.test(error.message)) {
      return { outcome: "retryable" };
    }
    throw new TestVerificationUnavailableError();
  }

  if (receipt.status !== "success") {
    return { outcome: "invalid", reason: "The transaction reverted." };
  }

  const transfers = parseEventLogs({
    abi: erc20Abi,
    eventName: "Transfer",
    logs: receipt.logs,
    strict: false,
  });
  const expected = BigInt(input.amountAtomic);
  const match = transfers.find(
    (log) =>
      log.address.toLowerCase() === input.tokenAddress.toLowerCase() &&
      log.args.from?.toLowerCase() === input.payerAddress.toLowerCase() &&
      log.args.to?.toLowerCase() === input.receiver.toLowerCase() &&
      log.args.value === expected,
  );
  if (!match) {
    return {
      outcome: "invalid",
      reason: "No matching USDC transfer from the buyer to the merchant for the intent amount.",
    };
  }

  return {
    outcome: "verified",
    tokenChanges: [
      {
        amountAtomic: input.amountAtomic,
        chainId: baseSepolia.id,
        receiver: input.receiver,
        tokenAddress: input.tokenAddress,
      },
    ],
    txHash: input.transactionId,
  };
}
