import { createHash } from "node:crypto";

import { getAddress, isAddress } from "viem";

import { canonicalResourceIdentity } from "./resource-identity";

const BASE_NETWORK = "eip155:8453";
const ARBITRUM_NETWORK = "eip155:42161";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ARBITRUM_USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const MAX_AUTHORIZATION_LIFETIME_SECONDS = 600;
// Mirrors numeric(20,0) cap cents at 10,000 atomic USDC units per cent.
const MAX_CAP_USD_CENTS = BigInt(10) ** BigInt(20) - BigInt(1);
const ATOMIC_UNITS_PER_CENT = BigInt(10_000);
export const MAX_USDC_AMOUNT_ATOMIC = MAX_CAP_USD_CENTS * ATOMIC_UNITS_PER_CENT;
const MAX_RESOURCE_HOST_LENGTH = 253;
const MAX_RESOURCE_URL_LENGTH = 2_048;
const HTTP_METHODS = new Set([
  "CONNECT",
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
  "TRACE",
]);
const SAFE_HTTP_LABEL = "HTTP request";
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

function safeHttpToolName(value: unknown) {
  if (typeof value !== "string" || value.length > 500) return SAFE_HTTP_LABEL;
  const match = /^([A-Za-z]+) (\S+)$/.exec(value);
  if (!match) return SAFE_HTTP_LABEL;
  const method = match[1]?.toUpperCase();
  const rawUrl = match[2];
  if (!method || !rawUrl || !HTTP_METHODS.has(method)) return SAFE_HTTP_LABEL;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return SAFE_HTTP_LABEL;
    const safe = `${method} ${url.origin}${url.pathname}`;
    return safe.length <= 500 ? safe : SAFE_HTTP_LABEL;
  } catch {
    return SAFE_HTTP_LABEL;
  }
}

function origin(value: unknown) {
  if (value === undefined) return null;
  const parsed = exactRecord(value, ["clientName", "toolName", "transport"]);
  if (
    typeof parsed.clientName !== "string" ||
    parsed.clientName.length < 1 ||
    parsed.clientName.length > 200 ||
    (parsed.transport !== "mcp" && parsed.transport !== "http")
  ) {
    throw new InvalidSignRequestError();
  }
  if (parsed.transport === "http") {
    return {
      clientName: parsed.clientName,
      toolName: safeHttpToolName(parsed.toolName),
      transport: "http" as const,
    };
  }
  if (
    typeof parsed.toolName !== "string" ||
    parsed.toolName.length < 1 ||
    parsed.toolName.length > 500
  ) {
    throw new InvalidSignRequestError();
  }
  return {
    clientName: parsed.clientName,
    toolName: parsed.toolName,
    transport: "mcp" as const,
  };
}

function resource(value: unknown) {
  if (typeof value !== "string" || value.length < 1 || value.length > MAX_RESOURCE_URL_LENGTH) {
    throw new InvalidSignRequestError();
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InvalidSignRequestError();
  }
  const resourceHost = url.hostname.toLowerCase();
  if (resourceHost.length < 1 || resourceHost.length > MAX_RESOURCE_HOST_LENGTH) {
    throw new InvalidSignRequestError();
  }
  url.hostname = resourceHost;
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  const resourceUrl = url.toString();
  if (resourceUrl.length < 1 || resourceUrl.length > MAX_RESOURCE_URL_LENGTH) {
    throw new InvalidSignRequestError();
  }
  try {
    return { resourceHost, resourceUrl, ...canonicalResourceIdentity(resourceUrl, resourceHost) };
  } catch {
    throw new InvalidSignRequestError();
  }
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
    "resourceUrl",
    "signerRequest",
  ]);
  const network = supportedNetwork(body.network);
  const amountAtomic = unsigned(body.amount);
  const amount = BigInt(amountAtomic);
  if (amount === BigInt(0) || amount > MAX_USDC_AMOUNT_ATOMIC) {
    throw new InvalidSignRequestError();
  }
  const asset = address(body.asset);
  const payTo = address(body.payTo);
  const parsedResource = resource(body.resourceUrl);
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
  const rawAuthorizationNonce = message.nonce;
  const validAfter = unsigned(message.validAfter);
  const validBefore = unsigned(message.validBefore);
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1_000);
  if (
    from !== address(options.agentAddress) ||
    address(message.to) !== payTo ||
    unsigned(message.value) !== amountAtomic ||
    validAfter !== "0" ||
    typeof rawAuthorizationNonce !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(rawAuthorizationNonce) ||
    BigInt(validBefore) <= BigInt(nowSeconds) ||
    BigInt(validBefore) > BigInt(nowSeconds + MAX_AUTHORIZATION_LIFETIME_SECONDS)
  ) {
    throw new InvalidSignRequestError();
  }
  const authorizationNonce = rawAuthorizationNonce.toLowerCase();

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
    ...parsedResource,
    requestFingerprint: createHash("sha256").update(fingerprint.join("\0")).digest("hex"),
    signerRequest: {
      domain,
      message: { ...message, nonce: authorizationNonce },
      primaryType: signerRequest.primaryType,
      types,
    },
  };
}
