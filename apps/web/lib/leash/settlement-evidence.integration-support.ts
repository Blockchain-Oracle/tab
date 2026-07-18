import { encodeAbiParameters, encodeEventTopics, encodeFunctionData } from "viem";

export const agentAddress = "0x2222222222222222222222222222222222222222";
export const payTo = "0x1111111111111111111111111111111111111111";
export const facilitator = "0x3333333333333333333333333333333333333333";
const baseUsdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const baseSepoliaUsdc = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const transaction = `0x${"ab".repeat(32)}` as const;
export const nonce = `0x${"12".repeat(32)}` as const;
const blockHash = `0x${"cd".repeat(32)}`;
export const authorizationValidBefore = new Date(2_000_000_000_000);

const transferWithAuthorization = [
  {
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    name: "transferWithAuthorization",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const settlementEvents = [
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

export function observedResult(overrides: Record<string, unknown> = {}) {
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

export function failedObservedResult(overrides: Record<string, unknown> = {}) {
  return observedResult({
    paymentResponse: {
      errorReason: "invalid_exact_evm_transaction_failed",
      network: "eip155:8453",
      payer: agentAddress,
      success: false,
      transaction,
    },
    ...overrides,
  });
}

export function rpcLog(
  topics: ReturnType<typeof encodeEventTopics>,
  data: `0x${string}`,
  logIndex: string,
  token = baseUsdc,
) {
  return {
    address: token,
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

export function validReceipt(token = baseUsdc, amount = BigInt(25_000)) {
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
      rpcLog(transferTopics, encodeAbiParameters([{ type: "uint256" }], [amount]), "0x0", token),
      rpcLog(authorizationTopics, "0x", "0x1", token),
    ],
    logsBloom: `0x${"00".repeat(256)}`,
    status: "0x1",
    to: token,
    transactionHash: transaction,
    transactionIndex: "0x0",
    type: "0x2",
  };
}

export function revertedTransaction(input = validFailedInput()) {
  return {
    blockHash,
    blockNumber: "0x1",
    chainId: "0x2105",
    from: facilitator,
    gas: "0x5208",
    gasPrice: "0x1",
    hash: transaction,
    input,
    nonce: "0x0",
    r: `0x${"11".repeat(32)}`,
    s: `0x${"22".repeat(32)}`,
    to: baseUsdc,
    transactionIndex: "0x0",
    type: "0x0",
    v: "0x1b",
    value: "0x0",
  };
}

export function validFailedInput(
  overrides: { payTo?: `0x${string}`; validAfter?: bigint; validBefore?: bigint } = {},
) {
  return encodeFunctionData({
    abi: transferWithAuthorization,
    args: [
      agentAddress,
      overrides.payTo ?? payTo,
      BigInt(25_000),
      overrides.validAfter ?? BigInt(0),
      overrides.validBefore ?? BigInt(2_000_000_000),
      nonce,
      27,
      `0x${"11".repeat(32)}`,
      `0x${"22".repeat(32)}`,
    ],
    functionName: "transferWithAuthorization",
  });
}
