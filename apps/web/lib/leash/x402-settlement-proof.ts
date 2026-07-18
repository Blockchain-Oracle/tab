import {
  createPublicClient,
  decodeEventLog,
  getAddress,
  http,
  isAddress,
  TransactionReceiptNotFoundError,
} from "viem";
import { arbitrum, base, baseSepolia } from "viem/chains";

const NETWORKS = {
  "eip155:42161": {
    chain: arbitrum,
    token: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  },
  "eip155:8453": {
    chain: base,
    token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
  "eip155:84532": {
    chain: baseSepolia,
    token: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
} as const;
const RPC_TIMEOUT_MS = 5_000;

const EVENTS = [
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

export type SettlementProofResult =
  | { status: "verified" }
  | {
      reason: "receipt_not_propagated" | "rpc_unavailable";
      status: "retryable";
    }
  | {
      reason:
        | "invalid_expectation"
        | "missing_authorization_used"
        | "missing_transfer"
        | "reverted"
        | "wrong_chain"
        | "wrong_token";
      status: "invalid";
    };

export interface SuccessfulSettlementProofInput {
  amountAtomic: string;
  asset: string;
  network: string;
  nonce: string;
  payee: string;
  payer: string;
  rpcUrl: string;
  rpcTimeoutMs?: number;
  transactionHash: `0x${string}`;
}

type FinalizedReceiptResult =
  | {
      receipt: Awaited<ReturnType<ReturnType<typeof proofClient>["getTransactionReceipt"]>>;
      status: "finalized";
    }
  | Extract<SettlementProofResult, { status: "invalid" | "retryable" }>;

function invalidExpectation(input: SuccessfulSettlementProofInput) {
  const configuration = NETWORKS[input.network as keyof typeof NETWORKS];
  return (
    !configuration ||
    !isAddress(input.asset) ||
    getAddress(input.asset) !== getAddress(configuration.token) ||
    !isAddress(input.payer) ||
    !isAddress(input.payee) ||
    !/^[1-9][0-9]*$/.test(input.amountAtomic) ||
    !/^0x[0-9a-fA-F]{64}$/.test(input.nonce) ||
    !/^0x[0-9a-fA-F]{64}$/.test(input.transactionHash) ||
    !input.rpcUrl
  );
}

function decoded(log: { data: `0x${string}`; topics: readonly `0x${string}`[] }) {
  try {
    const [signature, ...parameters] = log.topics;
    if (!signature) return null;
    return decodeEventLog({
      abi: EVENTS,
      data: log.data,
      strict: true,
      topics: [signature, ...parameters],
    });
  } catch {
    return null;
  }
}

function receiptNotFound(error: unknown) {
  return (
    error instanceof TransactionReceiptNotFoundError ||
    (error instanceof Error && error.name === "TransactionReceiptNotFoundError")
  );
}

function proofClient(network: keyof typeof NETWORKS, rpcUrl: string, timeoutMs = RPC_TIMEOUT_MS) {
  const requestedTimeout = Number.isFinite(timeoutMs) ? timeoutMs : RPC_TIMEOUT_MS;
  const timeout = Math.max(1, Math.min(requestedTimeout, RPC_TIMEOUT_MS));
  return createPublicClient({
    chain: NETWORKS[network].chain,
    transport: http(rpcUrl, {
      maxResponseBodySize: 1_048_576,
      retryCount: 0,
      timeout,
    }),
  });
}

async function readFinalizedReceipt(input: {
  network: string;
  rpcUrl: string;
  rpcTimeoutMs?: number;
  transactionHash: `0x${string}`;
}): Promise<FinalizedReceiptResult> {
  const network = input.network as keyof typeof NETWORKS;
  const configuration = NETWORKS[network];
  if (!configuration || !input.rpcUrl || !/^0x[0-9a-fA-F]{64}$/.test(input.transactionHash)) {
    return { reason: "invalid_expectation", status: "invalid" };
  }
  const client = proofClient(network, input.rpcUrl, input.rpcTimeoutMs);
  try {
    if ((await client.getChainId()) !== configuration.chain.id) {
      return { reason: "wrong_chain", status: "invalid" };
    }
  } catch {
    return { reason: "rpc_unavailable", status: "retryable" };
  }

  let receipt: Awaited<ReturnType<typeof client.getTransactionReceipt>>;
  try {
    receipt = await client.getTransactionReceipt({ hash: input.transactionHash });
  } catch (error) {
    return receiptNotFound(error)
      ? { reason: "receipt_not_propagated", status: "retryable" }
      : { reason: "rpc_unavailable", status: "retryable" };
  }

  try {
    const finalized = await client.getBlock({ blockTag: "finalized" });
    if (!finalized.hash || receipt.blockNumber > finalized.number) {
      return { reason: "receipt_not_propagated", status: "retryable" };
    }
    const canonical = await client.getBlock({ blockNumber: receipt.blockNumber });
    if (
      !canonical.hash ||
      canonical.number !== receipt.blockNumber ||
      canonical.hash.toLowerCase() !== receipt.blockHash.toLowerCase()
    ) {
      return { reason: "receipt_not_propagated", status: "retryable" };
    }
  } catch {
    return { reason: "rpc_unavailable", status: "retryable" };
  }
  return { receipt, status: "finalized" };
}

export async function readFinalizedSettlementTransaction(input: {
  network: string;
  rpcUrl: string;
  rpcTimeoutMs?: number;
  transactionHash: `0x${string}`;
}) {
  const proof = await readFinalizedReceipt(input);
  if (proof.status !== "finalized") return proof;
  const network = input.network as keyof typeof NETWORKS;
  try {
    const transaction = await proofClient(network, input.rpcUrl, input.rpcTimeoutMs).getTransaction(
      {
        hash: input.transactionHash,
      },
    );
    if (
      transaction.hash.toLowerCase() !== input.transactionHash.toLowerCase() ||
      transaction.blockNumber !== proof.receipt.blockNumber ||
      transaction.blockHash?.toLowerCase() !== proof.receipt.blockHash.toLowerCase()
    ) {
      return { reason: "receipt_not_propagated" as const, status: "retryable" as const };
    }
    return { receipt: proof.receipt, status: "finalized" as const, transaction };
  } catch {
    return { reason: "rpc_unavailable" as const, status: "retryable" as const };
  }
}

function belongsToFinalizedReceipt(
  log: {
    blockHash: `0x${string}` | null;
    blockNumber: bigint | null;
    removed: boolean;
    transactionHash: `0x${string}` | null;
  },
  receipt: Extract<FinalizedReceiptResult, { status: "finalized" }>["receipt"],
) {
  return (
    !log.removed &&
    log.blockNumber === receipt.blockNumber &&
    log.blockHash?.toLowerCase() === receipt.blockHash.toLowerCase() &&
    log.transactionHash?.toLowerCase() === receipt.transactionHash.toLowerCase()
  );
}

export async function verifySuccessfulSettlementProof(
  input: SuccessfulSettlementProofInput,
): Promise<SettlementProofResult> {
  if (invalidExpectation(input)) return { reason: "invalid_expectation", status: "invalid" };
  const configuration = NETWORKS[input.network as keyof typeof NETWORKS];
  if (!configuration) return { reason: "invalid_expectation", status: "invalid" };
  const finalized = await readFinalizedReceipt(input);
  if (finalized.status !== "finalized") return finalized;
  const { receipt } = finalized;
  if (
    !receipt.to ||
    !isAddress(receipt.to) ||
    getAddress(receipt.to) !== getAddress(configuration.token)
  ) {
    return { reason: "wrong_token", status: "invalid" };
  }
  if (receipt.status !== "success") return { reason: "reverted", status: "invalid" };

  let transferred = false;
  let authorizationUsed = false;
  for (const log of receipt.logs) {
    if (!belongsToFinalizedReceipt(log, receipt)) continue;
    if (!isAddress(log.address)) continue;
    if (getAddress(log.address) !== getAddress(configuration.token)) continue;
    const event = decoded(log);
    if (event?.eventName === "Transfer") {
      transferred ||=
        getAddress(event.args.from) === getAddress(input.payer) &&
        getAddress(event.args.to) === getAddress(input.payee) &&
        event.args.value === BigInt(input.amountAtomic);
    }
    if (event?.eventName === "AuthorizationUsed") {
      authorizationUsed ||=
        getAddress(event.args.authorizer) === getAddress(input.payer) &&
        event.args.nonce.toLowerCase() === input.nonce.toLowerCase();
    }
  }
  if (!transferred) return { reason: "missing_transfer", status: "invalid" };
  if (!authorizationUsed) {
    return { reason: "missing_authorization_used", status: "invalid" };
  }
  return { status: "verified" };
}
