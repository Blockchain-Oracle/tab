export type NetworkProfileId = "eip155:8453" | "eip155:42161" | "eip155:84532";
export type NetworkChainId = 8_453 | 42_161 | 84_532;

export interface NetworkAssetProfile {
  readonly decimals: number;
  readonly name: string;
  readonly symbol: string;
}

export interface CircleUsdcProfile extends NetworkAssetProfile {
  readonly address: `0x${string}`;
  readonly name: "USD Coin" | "USDC";
  readonly symbol: "USDC";
}

export interface X402FacilitatorProfile {
  readonly access: "authenticated" | "public";
  readonly url: string;
}

export interface NetworkProfile {
  readonly caip2: NetworkProfileId;
  readonly chainId: NetworkChainId;
  readonly circleUsdc: CircleUsdcProfile;
  readonly displayName: string;
  readonly explorerOrigin: string;
  readonly facilitator: X402FacilitatorProfile;
  readonly nativeAsset: NetworkAssetProfile;
  readonly officialAssetId: "arbitrum" | "base";
  readonly rpcEnvironmentName: "ARBITRUM_RPC_URL" | "BASE_RPC_URL" | "BASE_SEPOLIA_RPC_URL";
  readonly testFunds: boolean;
}

const MAINNET_FACILITATOR = "https://api.cdp.coinbase.com/platform/v2/x402";
const TESTNET_FACILITATOR = "https://x402.org/facilitator";

function immutableProfile(profile: NetworkProfile) {
  Object.freeze(profile.circleUsdc);
  Object.freeze(profile.facilitator);
  Object.freeze(profile.nativeAsset);
  return Object.freeze(profile);
}

export const NETWORK_PROFILES: readonly NetworkProfile[] = Object.freeze([
  immutableProfile({
    caip2: "eip155:8453",
    chainId: 8_453,
    circleUsdc: {
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      decimals: 6,
      name: "USD Coin",
      symbol: "USDC",
    },
    displayName: "Base",
    explorerOrigin: "https://basescan.org",
    facilitator: { access: "authenticated", url: MAINNET_FACILITATOR },
    nativeAsset: { decimals: 18, name: "Ether", symbol: "ETH" },
    officialAssetId: "base",
    rpcEnvironmentName: "BASE_RPC_URL",
    testFunds: false,
  }),
  immutableProfile({
    caip2: "eip155:42161",
    chainId: 42_161,
    circleUsdc: {
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      decimals: 6,
      name: "USD Coin",
      symbol: "USDC",
    },
    displayName: "Arbitrum One",
    explorerOrigin: "https://arbiscan.io",
    facilitator: { access: "authenticated", url: MAINNET_FACILITATOR },
    nativeAsset: { decimals: 18, name: "Ether", symbol: "ETH" },
    officialAssetId: "arbitrum",
    rpcEnvironmentName: "ARBITRUM_RPC_URL",
    testFunds: false,
  }),
  immutableProfile({
    caip2: "eip155:84532",
    chainId: 84_532,
    circleUsdc: {
      address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      decimals: 6,
      name: "USDC",
      symbol: "USDC",
    },
    displayName: "Base Sepolia",
    explorerOrigin: "https://sepolia.basescan.org",
    facilitator: { access: "public", url: TESTNET_FACILITATOR },
    nativeAsset: { decimals: 18, name: "Sepolia Ether", symbol: "ETH" },
    officialAssetId: "base",
    rpcEnvironmentName: "BASE_SEPOLIA_RPC_URL",
    testFunds: true,
  }),
]);

export class UnknownNetworkProfileError extends Error {
  constructor() {
    super("The network profile is not configured.");
    this.name = "UnknownNetworkProfileError";
  }
}

export function getNetworkProfile(value: string) {
  const profile = NETWORK_PROFILES.find((candidate) => candidate.caip2 === value);
  if (!profile) throw new UnknownNetworkProfileError();
  return profile;
}

export function getNetworkProfileByChainId(value: number) {
  const profile = NETWORK_PROFILES.find((candidate) => candidate.chainId === value);
  if (!profile) throw new UnknownNetworkProfileError();
  return profile;
}
