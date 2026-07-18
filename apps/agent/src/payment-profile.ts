export const PAYMENT_PROFILES = ["mainnet", "base_sepolia_integration"] as const;

export type PaymentProfile = (typeof PAYMENT_PROFILES)[number];

export function isPaymentProfile(value: unknown): value is PaymentProfile {
  return PAYMENT_PROFILES.some((profile) => profile === value);
}
