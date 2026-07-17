import {
  createPublicClient,
  decodeEventLog,
  decodeFunctionData,
  getAddress,
  http,
  isAddress,
  type Log,
} from "viem";
import { arbitrum, base } from "viem/chains";

const SETTLEMENT_NETWORKS = {
  "eip155:42161": {
    chain: arbitrum,
    env: "ARBITRUM_RPC_URL",
    token: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  },
  "eip155:8453": {
    chain: base,
    env: "BASE_RPC_URL",
    token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
} as const;

const SETTLEMENT_EVENTS = [
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

const EIP3009_TRANSFERS = [
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
  {
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    name: "transferWithAuthorization",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

type LeashNetwork = keyof typeof SETTLEMENT_NETWORKS;

export class InvalidSettlementObservationError extends Error {
  readonly code = "INVALID_SETTLEMENT_OBSERVATION";

  constructor() {
    super("The settlement observation is invalid.");
    this.name = "InvalidSettlementObservationError";
  }
}

function exactRecord(value: unknown, keys: string[]) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidSettlementObservationError();
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) {
    throw new InvalidSettlementObservationError();
  }
  return record;
}

function canonicalAddress(value: unknown) {
  if (typeof value !== "string" || !isAddress(value)) {
    throw new InvalidSettlementObservationError();
  }
  return getAddress(value);
}

export function parseSettlementObservation(value: unknown) {
  const body = exactRecord(value, ["outcome", "paymentResponse", "receiptId"]);
  if (
    body.outcome !== "observed" ||
    typeof body.receiptId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      body.receiptId,
    )
  ) {
    throw new InvalidSettlementObservationError();
  }
  if (
    typeof body.paymentResponse !== "object" ||
    body.paymentResponse === null ||
    Array.isArray(body.paymentResponse)
  ) {
    throw new InvalidSettlementObservationError();
  }
  const responseValue = body.paymentResponse as Record<string, unknown>;
  const response = exactRecord(
    responseValue,
    responseValue.success === false
      ? responseValue.errorMessage === undefined
        ? ["errorReason", "network", "payer", "success", "transaction"]
        : ["errorMessage", "errorReason", "network", "payer", "success", "transaction"]
      : ["network", "payer", "success", "transaction"],
  );
  if (
    (response.success !== true && response.success !== false) ||
    typeof response.network !== "string" ||
    !(response.network in SETTLEMENT_NETWORKS) ||
    typeof response.transaction !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(response.transaction)
  ) {
    throw new InvalidSettlementObservationError();
  }
  const errorReason = response.success ? null : response.errorReason;
  const errorMessage = response.success ? undefined : response.errorMessage;
  if (
    (!response.success &&
      (typeof errorReason !== "string" || !/\S/.test(errorReason) || errorReason.length > 256)) ||
    (errorMessage !== undefined &&
      (typeof errorMessage !== "string" || !/\S/.test(errorMessage) || errorMessage.length > 2_048))
  ) {
    throw new InvalidSettlementObservationError();
  }
  const common = {
    network: response.network as LeashNetwork,
    payer: canonicalAddress(response.payer),
    receiptId: body.receiptId,
    transaction: response.transaction as `0x${string}`,
  };
  if (response.success) {
    return { ...common, errorMessage: null, errorReason: null, success: true as const };
  }
  return {
    ...common,
    errorMessage: (errorMessage ?? null) as string | null,
    errorReason: errorReason as string,
    success: false as const,
  };
}

function decodedLog(log: Log) {
  try {
    return decodeEventLog({
      abi: SETTLEMENT_EVENTS,
      data: log.data,
      strict: true,
      topics: log.topics,
    });
  } catch {
    return null;
  }
}

function matchesRevertedAuthorization(
  transaction: { input: `0x${string}`; to: string | null },
  token: string,
  expected: {
    agentAddress: string;
    amountAtomic: string;
    authorizationNonce: `0x${string}`;
    authorizationValidBefore: Date;
    payTo: string;
  },
) {
  try {
    if (!transaction.to || getAddress(transaction.to) !== getAddress(token)) return false;
    const decoded = decodeFunctionData({ abi: EIP3009_TRANSFERS, data: transaction.input });
    const args = decoded.args as readonly unknown[];
    return (
      decoded.functionName === "transferWithAuthorization" &&
      getAddress(args[0] as string) === getAddress(expected.agentAddress) &&
      getAddress(args[1] as string) === getAddress(expected.payTo) &&
      args[2] === BigInt(expected.amountAtomic) &&
      args[3] === BigInt(0) &&
      args[4] === BigInt(expected.authorizationValidBefore.getTime() / 1_000) &&
      (args[5] as string).toLowerCase() === expected.authorizationNonce.toLowerCase()
    );
  } catch {
    return false;
  }
}

export async function verifySettlementOnchain(
  evidence: ReturnType<typeof parseSettlementObservation>,
  expected: {
    agentAddress: string;
    amountAtomic: string;
    authorizationNonce: `0x${string}`;
    authorizationValidBefore: Date;
    network: string;
    payTo: string;
    rpcUrl?: string;
  },
) {
  if (
    !isAddress(expected.agentAddress) ||
    !isAddress(expected.payTo) ||
    evidence.network !== expected.network ||
    evidence.payer !== getAddress(expected.agentAddress) ||
    !/^[1-9][0-9]*$/.test(expected.amountAtomic) ||
    !/^0x[0-9a-fA-F]{64}$/.test(expected.authorizationNonce) ||
    !Number.isSafeInteger(expected.authorizationValidBefore.getTime() / 1_000)
  ) {
    return false;
  }
  const config = SETTLEMENT_NETWORKS[evidence.network];
  const rpcUrl = expected.rpcUrl ?? process.env[config.env] ?? config.chain.rpcUrls.default.http[0];
  const client = createPublicClient({ chain: config.chain, transport: http(rpcUrl) });
  let transactionReceipt: Awaited<ReturnType<typeof client.getTransactionReceipt>>;
  try {
    transactionReceipt = await client.getTransactionReceipt({ hash: evidence.transaction });
  } catch {
    return false;
  }
  if (!transactionReceipt.to || getAddress(transactionReceipt.to) !== getAddress(config.token)) {
    return false;
  }
  if (!evidence.success) {
    if (transactionReceipt.status !== "reverted") return false;
    try {
      const transaction = await client.getTransaction({ hash: evidence.transaction });
      return matchesRevertedAuthorization(transaction, config.token, expected);
    } catch {
      return false;
    }
  }
  if (transactionReceipt.status !== "success") return false;

  let transferred = false;
  let authorizationUsed = false;
  for (const log of transactionReceipt.logs) {
    if (getAddress(log.address) !== getAddress(config.token)) continue;
    const decoded = decodedLog(log);
    if (decoded?.eventName === "Transfer") {
      transferred ||=
        getAddress(decoded.args.from) === getAddress(expected.agentAddress) &&
        getAddress(decoded.args.to) === getAddress(expected.payTo) &&
        decoded.args.value === BigInt(expected.amountAtomic);
    }
    if (decoded?.eventName === "AuthorizationUsed") {
      authorizationUsed ||=
        getAddress(decoded.args.authorizer) === getAddress(expected.agentAddress) &&
        decoded.args.nonce.toLowerCase() === expected.authorizationNonce.toLowerCase();
    }
  }
  return transferred && authorizationUsed;
}
