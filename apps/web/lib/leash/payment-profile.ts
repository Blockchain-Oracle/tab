import { getNetworkProfile, type NetworkProfile, type NetworkProfileId } from "@tab/networks";

export const MAINNET_PAYMENT_PROFILE = "mainnet" as const;
export const BASE_SEPOLIA_INTEGRATION_PROFILE = "base_sepolia_integration" as const;
export type PaymentProfile =
  | typeof MAINNET_PAYMENT_PROFILE
  | typeof BASE_SEPOLIA_INTEGRATION_PROFILE;

export type LeashPaymentNetwork = NetworkProfileId;

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

function paymentNetwork(profile: NetworkProfile, label: string): PaymentNetworkConfiguration {
  return {
    asset: profile.circleUsdc.address,
    chainId: profile.chainId,
    domainName: profile.circleUsdc.name,
    explorerOrigin: profile.explorerOrigin,
    label,
    network: profile.caip2,
    rpcEnvironmentName: profile.rpcEnvironmentName,
    testFunds: profile.testFunds,
  };
}

const BASE = paymentNetwork(getNetworkProfile("eip155:8453"), "Base");
const ARBITRUM = paymentNetwork(getNetworkProfile("eip155:42161"), "Arbitrum");
const BASE_SEPOLIA = paymentNetwork(getNetworkProfile("eip155:84532"), "Base Sepolia");

export class InvalidPaymentProfileError extends Error {
  constructor() {
    super("The Agent payment profile is invalid.");
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
  const configured = environment.TAB_AGENT_PROVISIONING_PROFILE;
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
