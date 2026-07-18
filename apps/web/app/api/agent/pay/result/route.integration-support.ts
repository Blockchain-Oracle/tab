import { encodeAbiParameters, encodeEventTopics, encodeFunctionData } from "viem";

export const agentAddress = "0x2222222222222222222222222222222222222222";
export const payTo = "0x1111111111111111111111111111111111111111";
const facilitator = "0x3333333333333333333333333333333333333333";
export const baseUsdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const nonce = `0x${"12".repeat(32)}` as const;
export const authorizationValidBefore = new Date(2_000_000_000_000);
export const transaction = `0x${"ab".repeat(32)}` as const;
const blockHash = `0x${"cd".repeat(32)}`;
const zeroHash = `0x${"00".repeat(32)}`;

export function rpcBlock(number: number, hash = blockHash) {
  return {
    baseFeePerGas: "0x1",
    difficulty: "0x0",
    extraData: "0x",
    gasLimit: "0x1c9c380",
    gasUsed: "0x5208",
    hash,
    logsBloom: `0x${"00".repeat(256)}`,
    miner: facilitator,
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

export function rpcReceipt(includeAuthorization: boolean, success = true) {
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
    logs: success ? (includeAuthorization ? [transfer, authorization] : [transfer]) : [],
    logsBloom: `0x${"00".repeat(256)}`,
    status: success ? "0x1" : "0x0",
    to: baseUsdc,
    transactionHash: transaction,
    transactionIndex: "0x0",
    type: "0x2",
  };
}

export function rpcTransaction() {
  return {
    blockHash,
    blockNumber: "0x1",
    chainId: "0x2105",
    from: facilitator,
    gas: "0x5208",
    gasPrice: "0x1",
    hash: transaction,
    input: encodeFunctionData({
      abi: transferWithAuthorization,
      args: [
        agentAddress,
        payTo,
        BigInt(25_000),
        BigInt(0),
        BigInt(2_000_000_000),
        nonce,
        27,
        `0x${"11".repeat(32)}`,
        `0x${"22".repeat(32)}`,
      ],
      functionName: "transferWithAuthorization",
    }),
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
