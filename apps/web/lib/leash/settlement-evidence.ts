import { createPublicClient, decodeEventLog, getAddress, http, isAddress, type Log } from "viem";
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
  const response = exactRecord(body.paymentResponse, [
    "network",
    "payer",
    "success",
    "transaction",
  ]);
  if (
    response.success !== true ||
    typeof response.network !== "string" ||
    !(response.network in SETTLEMENT_NETWORKS) ||
    typeof response.transaction !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(response.transaction)
  ) {
    throw new InvalidSettlementObservationError();
  }
  return {
    network: response.network as LeashNetwork,
    payer: canonicalAddress(response.payer),
    receiptId: body.receiptId,
    transaction: response.transaction as `0x${string}`,
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

export async function verifySettlementOnchain(
  evidence: ReturnType<typeof parseSettlementObservation>,
  expected: {
    agentAddress: string;
    amountAtomic: string;
    authorizationNonce: `0x${string}`;
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
    !/^0x[0-9a-fA-F]{64}$/.test(expected.authorizationNonce)
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
  if (
    transactionReceipt.status !== "success" ||
    !transactionReceipt.to ||
    getAddress(transactionReceipt.to) !== getAddress(config.token)
  ) {
    return false;
  }

  let transferred = false;
  let authorizationUsed = false;
  for (const log of transactionReceipt.logs) {
    if (getAddress(log.address) !== getAddress(config.token)) continue;
    const decoded = decodedLog(log);
    if (decoded?.eventName === "Transfer") {
      transferred =
        getAddress(decoded.args.from) === getAddress(expected.agentAddress) &&
        getAddress(decoded.args.to) === getAddress(expected.payTo) &&
        decoded.args.value === BigInt(expected.amountAtomic);
    }
    if (decoded?.eventName === "AuthorizationUsed") {
      authorizationUsed =
        getAddress(decoded.args.authorizer) === getAddress(expected.agentAddress) &&
        decoded.args.nonce.toLowerCase() === expected.authorizationNonce.toLowerCase();
    }
  }
  return transferred && authorizationUsed;
}
