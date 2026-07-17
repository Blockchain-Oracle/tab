import { getAddress, type TypedData } from "viem";

import { ARBITRUM_NETWORK, ARBITRUM_USDC, BASE_NETWORK, BASE_USDC } from "./routing.js";

const MAX_AUTHORIZATION_LIFETIME_SECONDS = 600;
// Mirrors numeric(20,0) cap cents at 10,000 atomic USDC units per cent.
const MAX_CAP_USD_CENTS = 10n ** 20n - 1n;
const ATOMIC_UNITS_PER_CENT = 10_000n;
export const MAX_USDC_AMOUNT_ATOMIC = MAX_CAP_USD_CENTS * ATOMIC_UNITS_PER_CENT;
const AUTHORIZATION_TYPES = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" },
  { name: "validBefore", type: "uint256" },
  { name: "nonce", type: "bytes32" },
] as const;

export interface SignerRequest {
  domain: Record<string, unknown>;
  message: Record<string, unknown>;
  primaryType: string;
  types: Record<string, unknown>;
}

export class InvalidEip3009AuthorizationError extends Error {
  constructor() {
    super("The EIP-3009 authorization is invalid.");
    this.name = "InvalidEip3009AuthorizationError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactRecord(value: unknown, sortedKeys: string[]) {
  if (!record(value)) throw new InvalidEip3009AuthorizationError();
  const keys = Object.keys(value).sort();
  if (keys.length !== sortedKeys.length || keys.some((key, index) => key !== sortedKeys[index])) {
    throw new InvalidEip3009AuthorizationError();
  }
  return value;
}

function unsigned(value: unknown) {
  if (typeof value === "bigint" && value >= 0n) return value.toString();
  if (typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)) return value;
  throw new InvalidEip3009AuthorizationError();
}

function address(value: unknown) {
  if (typeof value !== "string") throw new InvalidEip3009AuthorizationError();
  try {
    return getAddress(value);
  } catch {
    throw new InvalidEip3009AuthorizationError();
  }
}

function network(chainIdValue: unknown) {
  const chainId =
    typeof chainIdValue === "number" && Number.isSafeInteger(chainIdValue)
      ? String(chainIdValue)
      : unsigned(chainIdValue);
  if (chainId === "8453") {
    return { asset: getAddress(BASE_USDC), chainId: 8453, network: BASE_NETWORK };
  }
  if (chainId === "42161") {
    return { asset: getAddress(ARBITRUM_USDC), chainId: 42161, network: ARBITRUM_NETWORK };
  }
  throw new InvalidEip3009AuthorizationError();
}

export function parseExactEip3009Authorization(
  value: SignerRequest,
  options: { address: `0x${string}`; nowSeconds: number },
) {
  const request = exactRecord(value, ["domain", "message", "primaryType", "types"]);
  if (request.primaryType !== "TransferWithAuthorization") {
    throw new InvalidEip3009AuthorizationError();
  }
  const domain = exactRecord(request.domain, ["chainId", "name", "verifyingContract", "version"]);
  const selectedNetwork = network(domain.chainId);
  const asset = address(domain.verifyingContract);
  if (domain.name !== "USD Coin" || domain.version !== "2" || asset !== selectedNetwork.asset) {
    throw new InvalidEip3009AuthorizationError();
  }
  const types = exactRecord(request.types, ["TransferWithAuthorization"]);
  if (JSON.stringify(types.TransferWithAuthorization) !== JSON.stringify(AUTHORIZATION_TYPES)) {
    throw new InvalidEip3009AuthorizationError();
  }
  const message = exactRecord(request.message, [
    "from",
    "nonce",
    "to",
    "validAfter",
    "validBefore",
    "value",
  ]);
  const from = address(message.from);
  const payTo = address(message.to);
  const amount = unsigned(message.value);
  const validAfter = unsigned(message.validAfter);
  const validBefore = unsigned(message.validBefore);
  const nonce = message.nonce;
  if (
    from !== getAddress(options.address) ||
    amount === "0" ||
    BigInt(amount) > MAX_USDC_AMOUNT_ATOMIC ||
    validAfter !== "0" ||
    typeof nonce !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(nonce) ||
    BigInt(validBefore) <= BigInt(options.nowSeconds) ||
    BigInt(validBefore) > BigInt(options.nowSeconds + MAX_AUTHORIZATION_LIFETIME_SECONDS)
  ) {
    throw new InvalidEip3009AuthorizationError();
  }
  const authorizationNonce = nonce as `0x${string}`;

  return {
    amount,
    asset,
    network: selectedNetwork.network,
    payTo,
    typedData: {
      domain: {
        chainId: selectedNetwork.chainId,
        name: "USD Coin",
        verifyingContract: asset,
        version: "2",
      },
      message: {
        from,
        nonce: authorizationNonce,
        to: payTo,
        validAfter: BigInt(validAfter),
        validBefore: BigInt(validBefore),
        value: BigInt(amount),
      },
      primaryType: "TransferWithAuthorization" as const,
      types: { TransferWithAuthorization: AUTHORIZATION_TYPES } satisfies TypedData,
    },
  };
}
