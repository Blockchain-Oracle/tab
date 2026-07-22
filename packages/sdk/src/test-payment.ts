import { createWalletClient, custom, erc20Abi, http, parseUnits, publicActions } from "viem";
import { baseSepolia } from "viem/chains";

import { BASE_SEPOLIA_MAGIC_NETWORK, getMagicClient } from "./magic";
import { TEST_TOKEN } from "./token-identity";

/** Public Base Sepolia RPC for receipt reads; the transfer itself is signed
 * and broadcast by the buyer's Magic embedded wallet. */
const DEFAULT_BASE_SEPOLIA_RPC = BASE_SEPOLIA_MAGIC_NETWORK.rpcUrl;

export class TestPaymentExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestPaymentExecutionError";
  }
}

export interface TestPaymentInput {
  amount: string;
  ownerAddress: string;
  publishableKey: string;
  receiver: string;
}

/**
 * A REAL sandbox payment: the buyer's Magic EOA transfers Base Sepolia USDC
 * to the merchant and waits for the receipt (~2-4s blocks). The returned
 * hash is the transaction id the server independently re-verifies via RPC —
 * the client is never trusted with settlement truth.
 */
export async function executeTestPayment(input: TestPaymentInput): Promise<{
  tokenChanges: object;
  transactionId: string;
}> {
  // Same (key, network) cache entry as the auth client — one iframe, one
  // session. A second instance would be logged out and hang on signing.
  const magic = await getMagicClient(input.publishableKey, BASE_SEPOLIA_MAGIC_NETWORK);

  const wallet = createWalletClient({
    account: input.ownerAddress as `0x${string}`,
    chain: baseSepolia,
    transport: custom({
      request: (args) =>
        Promise.resolve(magic.rpcProvider.request(args as { method: string; params: unknown[] })),
    }),
  }).extend(publicActions);

  let hash: `0x${string}`;
  try {
    hash = await wallet.writeContract({
      abi: erc20Abi,
      address: TEST_TOKEN.address,
      args: [input.receiver as `0x${string}`, parseUnits(input.amount, 6)],
      functionName: "transfer",
    });
  } catch (error) {
    throw new TestPaymentExecutionError(
      error instanceof Error && /denied|rejected/i.test(error.message)
        ? "The transfer was declined in the wallet."
        : "The sandbox USDC transfer could not be sent.",
    );
  }

  // Wait on a public RPC so a Magic provider hiccup can't strand a sent
  // transaction without evidence.
  const reader = createWalletClient({
    account: input.ownerAddress as `0x${string}`,
    chain: baseSepolia,
    transport: http(DEFAULT_BASE_SEPOLIA_RPC),
  }).extend(publicActions);
  const receipt = await reader.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (receipt.status !== "success") {
    throw new TestPaymentExecutionError("The sandbox USDC transfer reverted on Base Sepolia.");
  }

  return {
    tokenChanges: {
      amountAtomic: parseUnits(input.amount, 6).toString(),
      chainId: TEST_TOKEN.chainId,
      receiver: input.receiver,
      tokenAddress: TEST_TOKEN.address,
    },
    transactionId: hash,
  };
}
