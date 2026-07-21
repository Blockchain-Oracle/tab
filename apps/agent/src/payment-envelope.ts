import { decodePaymentSignatureHeader } from "@x402/core/http";
import type { PaymentPayload } from "@x402/core/types";
import { getAddress, isAddressEqual, recoverTypedDataAddress } from "viem";

import type { NewPaymentEnvelope } from "./payment-envelope-model.js";
import type { PaymentProfile } from "./payment-profile.js";
import type { TabRemoteSigner } from "./remote-signer.js";
import {
  ARBITRUM_NETWORK,
  ARBITRUM_USDC,
  BASE_NETWORK,
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC,
  BASE_USDC,
} from "./routing.js";

const AUTHORIZATION_TYPES = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" },
  { name: "validBefore", type: "uint256" },
  { name: "nonce", type: "bytes32" },
] as const;

const NETWORKS = {
  [ARBITRUM_NETWORK]: { asset: ARBITRUM_USDC, chainId: 42_161, name: "USD Coin" },
  [BASE_NETWORK]: { asset: BASE_USDC, chainId: 8_453, name: "USD Coin" },
  [BASE_SEPOLIA_NETWORK]: { asset: BASE_SEPOLIA_USDC, chainId: 84_532, name: "USDC" },
} as const;

export class PaymentEnvelopeValidationError extends Error {
  constructor() {
    super("The persisted payment envelope is invalid.");
    this.name = "PaymentEnvelopeValidationError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decimal(value: unknown) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new PaymentEnvelopeValidationError();
  }
  return value;
}

function address(value: unknown) {
  if (typeof value !== "string") throw new PaymentEnvelopeValidationError();
  try {
    return getAddress(value);
  } catch {
    throw new PaymentEnvelopeValidationError();
  }
}

export function newPaymentEnvelope(
  payload: PaymentPayload,
  paymentSignature: string,
  signer: TabRemoteSigner,
): NewPaymentEnvelope {
  const authorization = record(payload.payload.authorization)
    ? payload.payload.authorization
    : undefined;
  const signature = payload.payload.signature;
  const validBefore = authorization?.validBefore;
  if (
    typeof signature !== "string" ||
    typeof validBefore !== "string" ||
    !/^(0|[1-9][0-9]*)$/.test(validBefore)
  ) {
    throw new PaymentEnvelopeValidationError();
  }
  const validBeforeNumber = Number(validBefore);
  const receiptId = signer.receiptIdForSignature(signature);
  if (
    !paymentSignature ||
    !Number.isSafeInteger(validBeforeNumber) ||
    validBeforeNumber < 1 ||
    !receiptId
  ) {
    throw new PaymentEnvelopeValidationError();
  }
  return { paymentSignature, receiptId, validBefore: validBeforeNumber };
}

function networkFor(payload: PaymentPayload, profile: PaymentProfile) {
  const network = payload.accepted.network;
  const supported = NETWORKS[network as keyof typeof NETWORKS];
  const profileMatch =
    profile === "base_sepolia_integration"
      ? network === BASE_SEPOLIA_NETWORK
      : network === BASE_NETWORK || network === ARBITRUM_NETWORK;
  if (!supported || !profileMatch) throw new PaymentEnvelopeValidationError();
  return { ...supported, network: network as keyof typeof NETWORKS };
}

export async function parsePaymentEnvelope(
  paymentSignature: string,
  expectedAddress: `0x${string}`,
  profile: PaymentProfile,
) {
  try {
    const payload = decodePaymentSignatureHeader(paymentSignature);
    if (payload.x402Version !== 2 || payload.accepted.scheme !== "exact") {
      throw new PaymentEnvelopeValidationError();
    }
    const selected = networkFor(payload, profile);
    const authorization = record(payload.payload.authorization)
      ? payload.payload.authorization
      : undefined;
    const signature = payload.payload.signature;
    if (
      !authorization ||
      typeof signature !== "string" ||
      !/^0x[0-9a-fA-F]{130}$/.test(signature)
    ) {
      throw new PaymentEnvelopeValidationError();
    }
    const from = address(authorization.from);
    const to = address(authorization.to);
    const value = decimal(authorization.value);
    const validAfter = decimal(authorization.validAfter);
    const validBeforeRaw = decimal(authorization.validBefore);
    const nonce = authorization.nonce;
    if (
      !isAddressEqual(from, expectedAddress) ||
      !isAddressEqual(to, address(payload.accepted.payTo)) ||
      !isAddressEqual(address(payload.accepted.asset), getAddress(selected.asset)) ||
      value !== payload.accepted.amount ||
      validAfter !== "0" ||
      typeof nonce !== "string" ||
      !/^0x[0-9a-fA-F]{64}$/.test(nonce) ||
      payload.accepted.extra.name !== selected.name ||
      payload.accepted.extra.version !== "2"
    ) {
      throw new PaymentEnvelopeValidationError();
    }
    const recovered = await recoverTypedDataAddress({
      domain: {
        chainId: selected.chainId,
        name: selected.name,
        verifyingContract: getAddress(selected.asset),
        version: "2",
      },
      message: {
        from,
        nonce: nonce as `0x${string}`,
        to,
        validAfter: BigInt(validAfter),
        validBefore: BigInt(validBeforeRaw),
        value: BigInt(value),
      },
      primaryType: "TransferWithAuthorization",
      signature: signature as `0x${string}`,
      types: { TransferWithAuthorization: AUTHORIZATION_TYPES },
    });
    if (!isAddressEqual(recovered, expectedAddress)) throw new PaymentEnvelopeValidationError();
    const validBefore = Number(validBeforeRaw);
    if (!Number.isSafeInteger(validBefore)) throw new PaymentEnvelopeValidationError();
    return {
      asset: getAddress(selected.asset),
      from,
      network: selected.network,
      nonce: nonce as `0x${string}`,
      payload,
      signature: signature as `0x${string}`,
      validBefore,
    };
  } catch (error) {
    if (error instanceof PaymentEnvelopeValidationError) throw error;
    throw new PaymentEnvelopeValidationError();
  }
}
