import type { PaymentRequirements } from "@x402/core/types";

export const BASE_NETWORK = "eip155:8453" as const;
export const ARBITRUM_NETWORK = "eip155:42161" as const;
export const BASE_V1_NETWORK = "base";
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const ARBITRUM_USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

export class UnsupportedPaymentNetworkError extends Error {
  readonly code = "UNSUPPORTED_NETWORK";

  constructor() {
    super("The resource does not accept a supported Leash payment network.");
    this.name = "UnsupportedPaymentNetworkError";
  }
}

function isSupportedAsset(requirement: PaymentRequirements) {
  const asset = requirement.asset.toLowerCase();
  if (requirement.network === BASE_NETWORK) return asset === BASE_USDC.toLowerCase();
  if (requirement.network === ARBITRUM_NETWORK) return asset === ARBITRUM_USDC.toLowerCase();
  if (String(requirement.network) === BASE_V1_NETWORK) return asset === BASE_USDC.toLowerCase();
  return false;
}

export function selectLeashPaymentRequirements(
  x402Version: number,
  requirements: PaymentRequirements[],
) {
  const exact = requirements.filter(
    (requirement) =>
      requirement.scheme === "exact" &&
      isSupportedAsset(requirement) &&
      (requirement.extra.assetTransferMethod === undefined ||
        requirement.extra.assetTransferMethod === "eip3009"),
  );
  if (x402Version === 1) {
    const base = exact.find((requirement) => String(requirement.network) === BASE_V1_NETWORK);
    if (base) return base;
    throw new UnsupportedPaymentNetworkError();
  }

  for (const network of [BASE_NETWORK, ARBITRUM_NETWORK]) {
    const match = exact.find((requirement) => requirement.network === network);
    if (match) return match;
  }
  throw new UnsupportedPaymentNetworkError();
}
