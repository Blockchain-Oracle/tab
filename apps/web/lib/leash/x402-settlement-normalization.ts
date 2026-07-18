import { getAddress, isAddress } from "viem";

import type { X402TestnetSettlement } from "./x402-testnet-resource";

export const X402_TESTNET_NETWORK = "eip155:84532" as const;
export const X402_TESTNET_ASSET = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const X402_FACILITATOR_URL = "https://x402.org/facilitator";
export const X402_EXPLORER_TX_BASE = "https://sepolia.basescan.org/tx/";

export type X402ResourceSettlementInput = {
  amountAtomic: string;
  asset: string;
  authorizationValidAfter: Date;
  authorizationValidBefore: Date;
  endpoint: string;
  facilitatorResponse: Record<string, unknown>;
  network: typeof X402_TESTNET_NETWORK;
  nonce: string;
  payee: string;
  payer: string;
  paymentFingerprint?: string | null;
  paymentIdentifier?: string | null;
  receiptId?: string | null;
  settledAt: Date;
  txHash: string;
};

export class InvalidX402SettlementEvidenceError extends Error {
  readonly code = "INVALID_X402_SETTLEMENT_EVIDENCE";

  constructor() {
    super("The x402 settlement evidence is invalid.");
    this.name = "InvalidX402SettlementEvidenceError";
  }
}

function invalid(): never {
  throw new InvalidX402SettlementEvidenceError();
}

function address(value: string) {
  if (!isAddress(value) || /^0x0{40}$/i.test(value)) invalid();
  return getAddress(value);
}

function date(value: Date) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid();
  return new Date(value.getTime());
}

function endpoint(value: string) {
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/api/x402/testnet" ||
      parsed.search ||
      parsed.hash
    ) {
      invalid();
    }
    return parsed.toString();
  } catch (error) {
    if (error instanceof InvalidX402SettlementEvidenceError) throw error;
    return invalid();
  }
}

function response(value: Record<string, unknown>, txHash: string, payer: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    return invalid();
  }
  if (
    Buffer.byteLength(encoded, "utf8") > 32_768 ||
    value.success !== true ||
    value.network !== X402_TESTNET_NETWORK ||
    typeof value.transaction !== "string" ||
    value.transaction.toLowerCase() !== txHash ||
    typeof value.payer !== "string" ||
    !isAddress(value.payer) ||
    getAddress(value.payer) !== payer
  ) {
    invalid();
  }
  return value;
}

export function normalizeX402ResourceSettlement(input: X402ResourceSettlementInput) {
  if (input.network !== X402_TESTNET_NETWORK) invalid();
  if (!isAddress(input.asset) || getAddress(input.asset) !== X402_TESTNET_ASSET) invalid();
  if (input.amountAtomic !== "1000") invalid();
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.txHash)) invalid();
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.nonce)) invalid();
  const txHash = input.txHash.toLowerCase();
  const payer = address(input.payer);
  const validAfter = date(input.authorizationValidAfter);
  const validBefore = date(input.authorizationValidBefore);
  const settledAt = date(input.settledAt);
  if (validAfter >= validBefore) invalid();
  const paymentIdentifier = input.paymentIdentifier ?? null;
  const paymentFingerprint = input.paymentFingerprint ?? null;
  const receiptId = input.receiptId ?? null;
  if (
    paymentIdentifier !== null &&
    (paymentIdentifier.length < 1 ||
      paymentIdentifier.length > 256 ||
      paymentIdentifier.trim() !== paymentIdentifier ||
      !/\S/.test(paymentIdentifier))
  ) {
    invalid();
  }
  if (paymentFingerprint !== null && !/^[0-9a-f]{64}$/.test(paymentFingerprint)) invalid();
  if (
    receiptId !== null &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receiptId)
  ) {
    invalid();
  }
  return {
    amountAtomic: input.amountAtomic,
    asset: X402_TESTNET_ASSET,
    authorizationValidAfter: validAfter,
    authorizationValidBefore: validBefore,
    endpoint: endpoint(input.endpoint),
    explorerUrl: `${X402_EXPLORER_TX_BASE}${txHash}`,
    facilitatorResponse: response(input.facilitatorResponse, txHash, payer),
    facilitatorUrl: X402_FACILITATOR_URL,
    network: X402_TESTNET_NETWORK,
    nonce: input.nonce.toLowerCase(),
    payee: address(input.payee),
    payer,
    paymentFingerprint,
    paymentIdentifier,
    receiptId,
    settledAt,
    testFunds: true,
    txHash,
  };
}

function authorizationDate(value: string) {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) invalid();
  const seconds = BigInt(value);
  if (seconds > BigInt(Number.MAX_SAFE_INTEGER) / BigInt(1_000)) invalid();
  return new Date(Number(seconds) * 1_000);
}

export function x402ResourceInputFromSettlement(
  settlement: X402TestnetSettlement,
  receiptId: string | null = null,
  paymentFingerprint: string | null = null,
): X402ResourceSettlementInput {
  return {
    amountAtomic: settlement.amount,
    asset: settlement.asset,
    authorizationValidAfter: authorizationDate(settlement.authorizationValidAfter),
    authorizationValidBefore: authorizationDate(settlement.authorizationValidBefore),
    endpoint: settlement.endpoint,
    facilitatorResponse: settlement.facilitatorResponse as Record<string, unknown>,
    network: settlement.network,
    nonce: settlement.nonce,
    payee: settlement.payee,
    payer: settlement.payer,
    paymentFingerprint,
    paymentIdentifier: null,
    receiptId,
    settledAt: new Date(),
    txHash: settlement.transactionHash,
  };
}
