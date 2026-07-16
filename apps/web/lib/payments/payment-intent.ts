import { getAddress, isAddress, zeroAddress } from "viem";

export const ARBITRUM_CHAIN_ID = 42161;
export const ARBITRUM_USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

const INTENT_KEYS = ["amount", "currency", "receiver", "token"];
const TOKEN_KEYS = ["address", "chainId"];
const AMOUNT_PATTERN = /^(?:0\.\d{1,6}|[1-9]\d{0,13}(?:\.\d{1,6})?)$/;
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export class InvalidPaymentIntentError extends Error {
  readonly code = "INVALID_PAYMENT_INTENT";

  constructor() {
    super("The merchant payment intent is invalid");
    this.name = "InvalidPaymentIntentError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, expected: string[]) {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

export function parseUsdAmount(value: unknown) {
  if (typeof value !== "string" || !AMOUNT_PATTERN.test(value) || !/[1-9]/.test(value)) {
    throw new InvalidPaymentIntentError();
  }

  return value;
}

export function parsePaymentAddress(value: unknown) {
  if (typeof value !== "string" || !isAddress(value)) return undefined;
  const address = getAddress(value);
  return address === zeroAddress ? undefined : address;
}

export function parseIntentAuditUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2_048) {
    throw new InvalidPaymentIntentError();
  }

  try {
    const url = new URL(value);
    const isLocalHttp = url.protocol === "http:" && LOOPBACK_HOSTNAMES.has(url.hostname);
    if ((url.protocol !== "https:" && !isLocalHttp) || url.username || url.password || url.hash) {
      throw new InvalidPaymentIntentError();
    }
    return url.toString();
  } catch (error) {
    if (error instanceof InvalidPaymentIntentError) throw error;
    throw new InvalidPaymentIntentError();
  }
}

export function parsePaymentIntent(value: unknown) {
  if (!isRecord(value) || !hasOnlyKeys(value, INTENT_KEYS)) {
    throw new InvalidPaymentIntentError();
  }
  if (value.currency !== "USD") {
    throw new InvalidPaymentIntentError();
  }
  const amount = parseUsdAmount(value.amount);

  const receiver = parsePaymentAddress(value.receiver);
  if (!receiver || !isRecord(value.token) || !hasOnlyKeys(value.token, TOKEN_KEYS)) {
    throw new InvalidPaymentIntentError();
  }

  const tokenAddress = parsePaymentAddress(value.token.address);
  if (
    value.token.chainId !== ARBITRUM_CHAIN_ID ||
    !tokenAddress ||
    tokenAddress !== ARBITRUM_USDC_ADDRESS
  ) {
    throw new InvalidPaymentIntentError();
  }

  return {
    amount,
    currency: "USD" as const,
    receiver,
    token: {
      address: tokenAddress,
      chainId: ARBITRUM_CHAIN_ID,
    },
  };
}
