import { createHash } from "node:crypto";

import { getAddress, isAddress } from "viem";

const BASE_NETWORK = "eip155:8453";
const ARBITRUM_NETWORK = "eip155:42161";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ARBITRUM_USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const MAX_AUTHORIZATION_LIFETIME_SECONDS = 600;
const AUTHORIZATION_TYPES = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" },
  { name: "validBefore", type: "uint256" },
  { name: "nonce", type: "bytes32" },
];

export class InvalidSignRequestError extends Error {
  readonly code = "INVALID_SIGN_REQUEST";

  constructor() {
    super("The signing request is invalid.");
    this.name = "InvalidSignRequestError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactRecord(value: unknown, keys: string[]) {
  if (!record(value)) throw new InvalidSignRequestError();
  const actual = Object.keys(value).sort();
  if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) {
    throw new InvalidSignRequestError();
  }
  return value;
}

function unsigned(value: unknown) {
  const serialized =
    typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof serialized !== "string" || !/^(0|[1-9][0-9]*)$/.test(serialized)) {
    throw new InvalidSignRequestError();
  }
  return serialized;
}

function address(value: unknown) {
  if (typeof value !== "string" || !isAddress(value)) throw new InvalidSignRequestError();
  return getAddress(value);
}

function supportedNetwork(value: unknown) {
  if (value === BASE_NETWORK)
    return { asset: getAddress(BASE_USDC), chainId: "8453", network: BASE_NETWORK } as const;
  if (value === ARBITRUM_NETWORK) {
    return {
      asset: getAddress(ARBITRUM_USDC),
      chainId: "42161",
      network: ARBITRUM_NETWORK,
    } as const;
  }
  throw new InvalidSignRequestError();
}

function origin(value: unknown) {
  if (value === undefined) return null;
  const parsed = exactRecord(value, ["clientName", "toolName", "transport"]);
  if (
    typeof parsed.clientName !== "string" ||
    parsed.clientName.length < 1 ||
    parsed.clientName.length > 200 ||
    typeof parsed.toolName !== "string" ||
    parsed.toolName.length < 1 ||
    parsed.toolName.length > 500 ||
    (parsed.transport !== "mcp" && parsed.transport !== "http")
  ) {
    throw new InvalidSignRequestError();
  }
  return {
    clientName: parsed.clientName,
    toolName: parsed.toolName,
    transport: parsed.transport as "http" | "mcp",
  };
}

export function parseSignRequest(
  value: unknown,
  options: { agentAddress: string; nowSeconds?: number },
) {
  const body = exactRecord(value, [
    "amount",
    "asset",
    "network",
    "origin",
    "payTo",
    "signerRequest",
  ]);
  const network = supportedNetwork(body.network);
  const amountAtomic = unsigned(body.amount);
  if (BigInt(amountAtomic) === BigInt(0)) throw new InvalidSignRequestError();
  const asset = address(body.asset);
  const payTo = address(body.payTo);
  if (asset !== network.asset) throw new InvalidSignRequestError();

  const signerRequest = exactRecord(body.signerRequest, [
    "domain",
    "message",
    "primaryType",
    "types",
  ]);
  if (signerRequest.primaryType !== "TransferWithAuthorization") {
    throw new InvalidSignRequestError();
  }
  const domain = exactRecord(signerRequest.domain, [
    "chainId",
    "name",
    "verifyingContract",
    "version",
  ]);
  if (
    domain.name !== "USD Coin" ||
    domain.version !== "2" ||
    unsigned(domain.chainId) !== network.chainId ||
    address(domain.verifyingContract) !== asset
  ) {
    throw new InvalidSignRequestError();
  }
  const types = exactRecord(signerRequest.types, ["TransferWithAuthorization"]);
  if (JSON.stringify(types.TransferWithAuthorization) !== JSON.stringify(AUTHORIZATION_TYPES)) {
    throw new InvalidSignRequestError();
  }

  const message = exactRecord(signerRequest.message, [
    "from",
    "nonce",
    "to",
    "validAfter",
    "validBefore",
    "value",
  ]);
  const from = address(message.from);
  const authorizationNonce = message.nonce;
  const validAfter = unsigned(message.validAfter);
  const validBefore = unsigned(message.validBefore);
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1_000);
  if (
    from !== address(options.agentAddress) ||
    address(message.to) !== payTo ||
    unsigned(message.value) !== amountAtomic ||
    validAfter !== "0" ||
    typeof authorizationNonce !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(authorizationNonce) ||
    BigInt(validBefore) <= BigInt(nowSeconds) ||
    BigInt(validBefore) > BigInt(nowSeconds + MAX_AUTHORIZATION_LIFETIME_SECONDS)
  ) {
    throw new InvalidSignRequestError();
  }

  const fingerprint = [
    network.network,
    asset,
    from,
    payTo,
    amountAtomic,
    validAfter,
    validBefore,
    authorizationNonce,
  ];
  return {
    amountAtomic,
    asset,
    authorizationNonce,
    authorizationValidBefore: new Date(Number(validBefore) * 1_000),
    network: network.network,
    origin: origin(body.origin),
    payTo,
    requestFingerprint: createHash("sha256").update(fingerprint.join("\0")).digest("hex"),
    signerRequest: { domain, message, primaryType: signerRequest.primaryType, types },
  };
}
