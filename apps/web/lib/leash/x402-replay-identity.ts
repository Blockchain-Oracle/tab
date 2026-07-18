import { isDeepStrictEqual } from "node:util";

import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { getAddress, isAddress } from "viem";

import type { DurableX402Attempt } from "./x402-settlement-attempt-store";
import {
  normalizeX402TestnetSettlement,
  normalizeX402TestnetSettlementAttempt,
  type X402TestnetResourceConfig,
  type X402TestnetSettlement,
} from "./x402-testnet-resource";

export type X402AuthorizationIdentity = {
  network: string;
  nonce: `0x${string}`;
  payer: `0x${string}`;
};

export function x402AuthorizationIdentity(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
): X402AuthorizationIdentity {
  const authorization = payload.payload.authorization;
  if (!authorization || typeof authorization !== "object" || Array.isArray(authorization)) {
    throw new Error("The x402 authorization identity is invalid.");
  }
  const fields = authorization as Record<string, unknown>;
  if (
    typeof fields.from !== "string" ||
    !isAddress(fields.from) ||
    typeof fields.nonce !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(fields.nonce)
  ) {
    throw new Error("The x402 authorization identity is invalid.");
  }
  return {
    network: requirements.network,
    nonce: fields.nonce.toLowerCase() as `0x${string}`,
    payer: getAddress(fields.from),
  };
}

export function x402IdentityKey(identity: X402AuthorizationIdentity) {
  return `${identity.network}:${identity.payer.toLowerCase()}:${identity.nonce}`;
}

export function sameX402SettlementAuthorization(
  stored: X402TestnetSettlement,
  config: X402TestnetResourceConfig,
  payload: PaymentPayload,
  requirements: PaymentRequirements,
) {
  try {
    const normalized = normalizeX402TestnetSettlement(config, {
      declaredExtensions: {},
      paymentPayload: payload,
      requirements,
      result: stored.facilitatorResponse,
    });
    return isDeepStrictEqual(normalized, stored);
  } catch {
    return false;
  }
}

export function sameX402AttemptAuthorization(
  stored: DurableX402Attempt,
  config: X402TestnetResourceConfig,
  payload: PaymentPayload,
  requirements: PaymentRequirements,
) {
  try {
    const normalized = normalizeX402TestnetSettlementAttempt(config, payload, requirements);
    const {
      facilitatorResponse: _response,
      paymentFingerprint: _fingerprint,
      startBlock: _startBlock,
      transactionHash: _transaction,
      ...identity
    } = stored;
    return isDeepStrictEqual(normalized, identity);
  } catch {
    return false;
  }
}

export function settlementFromAttempt(attempt: DurableX402Attempt) {
  if (!attempt.facilitatorResponse || !attempt.transactionHash) return null;
  const { paymentFingerprint: _fingerprint, startBlock: _startBlock, ...settlement } = attempt;
  return settlement as X402TestnetSettlement;
}
