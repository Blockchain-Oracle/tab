import type { PaymentRequirements } from "@x402/core/types";

import type { PaymentProfile } from "./payment-profile.js";

export const BASE_NETWORK = "eip155:8453" as const;
export const ARBITRUM_NETWORK = "eip155:42161" as const;
export const BASE_SEPOLIA_NETWORK = "eip155:84532" as const;
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const ARBITRUM_USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
export const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

export class UnsupportedPaymentNetworkError extends Error {
  readonly code = "UNSUPPORTED_NETWORK";

  constructor() {
    super("The resource does not accept a supported Agent payment network.");
    this.name = "UnsupportedPaymentNetworkError";
  }
}

const PROFILE_NETWORKS = {
  base_sepolia_integration: [
    { asset: BASE_SEPOLIA_USDC, name: "USDC", network: BASE_SEPOLIA_NETWORK },
  ],
  mainnet: [
    { asset: BASE_USDC, name: "USD Coin", network: BASE_NETWORK },
    { asset: ARBITRUM_USDC, name: "USD Coin", network: ARBITRUM_NETWORK },
  ],
} as const satisfies Record<PaymentProfile, readonly object[]>;

function supportedNetwork(paymentProfile: PaymentProfile, requirement: PaymentRequirements) {
  return PROFILE_NETWORKS[paymentProfile].find(
    (entry) =>
      requirement.network === entry.network &&
      requirement.asset.toLowerCase() === entry.asset.toLowerCase() &&
      requirement.extra.name === entry.name &&
      requirement.extra.version === "2",
  );
}

export function selectLeashPaymentRequirements(
  paymentProfile: PaymentProfile,
  x402Version: number,
  requirements: PaymentRequirements[],
) {
  if (x402Version !== 2) throw new UnsupportedPaymentNetworkError();
  const exact = requirements.filter(
    (requirement) =>
      requirement.scheme === "exact" &&
      supportedNetwork(paymentProfile, requirement) !== undefined &&
      (requirement.extra.assetTransferMethod === undefined ||
        requirement.extra.assetTransferMethod === "eip3009"),
  );
  for (const entry of PROFILE_NETWORKS[paymentProfile]) {
    const match = exact.find((requirement) => requirement.network === entry.network);
    if (match) return match;
  }
  throw new UnsupportedPaymentNetworkError();
}
