import assert from "node:assert/strict";
import test from "node:test";

const RED_MARKER = "[RED: canonical network profiles]";
const MAINNET_FACILITATOR = "https://api.cdp.coinbase.com/platform/v2/x402";
const TESTNET_FACILITATOR = "https://x402.org/facilitator";

const expectedProfiles = [
  {
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
  },
  {
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
  },
  {
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
  },
];

async function loadImplementation() {
  try {
    return await import(new URL("./index.ts", import.meta.url).href);
  } catch (error) {
    throw new Error(`${RED_MARKER} implementation exports are absent.`, { cause: error });
  }
}

test(`${RED_MARKER} are exact, immutable, and fail closed`, async () => {
  const implementation = await loadImplementation();
  assert.deepEqual(implementation.NETWORK_PROFILES, expectedProfiles);
  assert.equal(Object.isFrozen(implementation.NETWORK_PROFILES), true);

  for (const profile of implementation.NETWORK_PROFILES) {
    assert.equal(Object.isFrozen(profile), true);
    assert.equal(Object.isFrozen(profile.circleUsdc), true);
    assert.equal(Object.isFrozen(profile.facilitator), true);
    assert.equal(Object.isFrozen(profile.nativeAsset), true);
    assert.equal(implementation.getNetworkProfile(profile.caip2), profile);
    assert.equal(implementation.getNetworkProfileByChainId(profile.chainId), profile);
  }

  assert.throws(
    () => implementation.getNetworkProfile("eip155:999999"),
    (error) =>
      error instanceof implementation.UnknownNetworkProfileError &&
      error.message === "The network profile is not configured.",
  );
  assert.throws(
    () => implementation.getNetworkProfileByChainId(999_999),
    (error) => error instanceof implementation.UnknownNetworkProfileError,
  );
  assert.equal(implementation.getNetworkProfile("eip155:8453").testFunds, false);
  assert.equal(implementation.getNetworkProfile("eip155:84532").testFunds, true);
});
