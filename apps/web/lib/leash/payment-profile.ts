export const MAINNET_PAYMENT_PROFILE = "mainnet" as const;
export const BASE_SEPOLIA_INTEGRATION_PROFILE = "base_sepolia_integration" as const;
export type PaymentProfile =
  | typeof MAINNET_PAYMENT_PROFILE
  | typeof BASE_SEPOLIA_INTEGRATION_PROFILE;

export type LeashPaymentNetwork = "eip155:8453" | "eip155:42161" | "eip155:84532";

export interface PaymentNetworkConfiguration {
  asset: `0x${string}`;
  chainId: number;
  domainName: "USD Coin" | "USDC";
  explorerOrigin: string;
  label: string;
  network: LeashPaymentNetwork;
  rpcEnvironmentName: "BASE_RPC_URL" | "ARBITRUM_RPC_URL" | "BASE_SEPOLIA_RPC_URL";
  testFunds: boolean;
}

const BASE: PaymentNetworkConfiguration = {
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  chainId: 8_453,
  domainName: "USD Coin",
  explorerOrigin: "https://basescan.org",
  label: "Base",
  network: "eip155:8453",
  rpcEnvironmentName: "BASE_RPC_URL",
  testFunds: false,
};
const ARBITRUM: PaymentNetworkConfiguration = {
  asset: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  chainId: 42_161,
  domainName: "USD Coin",
  explorerOrigin: "https://arbiscan.io",
  label: "Arbitrum",
  network: "eip155:42161",
  rpcEnvironmentName: "ARBITRUM_RPC_URL",
  testFunds: false,
};
const BASE_SEPOLIA: PaymentNetworkConfiguration = {
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  chainId: 84_532,
  domainName: "USDC",
  explorerOrigin: "https://sepolia.basescan.org",
  label: "Base Sepolia",
  network: "eip155:84532",
  rpcEnvironmentName: "BASE_SEPOLIA_RPC_URL",
  testFunds: true,
};

export class InvalidPaymentProfileError extends Error {
  constructor() {
    super("The Leash payment profile is invalid.");
    this.name = "InvalidPaymentProfileError";
  }
}

export function parsePaymentProfile(value: unknown): PaymentProfile {
  if (value === MAINNET_PAYMENT_PROFILE || value === BASE_SEPOLIA_INTEGRATION_PROFILE) {
    return value;
  }
  throw new InvalidPaymentProfileError();
}

export function provisioningPaymentProfile(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const configured = environment.LEASH_PROVISIONING_PROFILE;
  return configured === undefined ? MAINNET_PAYMENT_PROFILE : parsePaymentProfile(configured);
}

export function networksForPaymentProfile(profile: PaymentProfile) {
  if (profile === MAINNET_PAYMENT_PROFILE) return [BASE, ARBITRUM] as const;
  if (profile === BASE_SEPOLIA_INTEGRATION_PROFILE) return [BASE_SEPOLIA] as const;
  throw new InvalidPaymentProfileError();
}

export function paymentNetworkConfiguration(network: string) {
  const configuration = [BASE, ARBITRUM, BASE_SEPOLIA].find(
    (candidate) => candidate.network === network,
  );
  if (!configuration) throw new InvalidPaymentProfileError();
  return configuration;
}

export function profileAllowsNetwork(profile: PaymentProfile, network: string) {
  return networksForPaymentProfile(profile).some((candidate) => candidate.network === network);
}
