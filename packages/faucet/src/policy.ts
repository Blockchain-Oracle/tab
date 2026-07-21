import { getNetworkProfileByChainId } from "@tab/networks";

/**
 * The fixed starter grant. Testnet-only BY CONSTRUCTION: the faucet is bound
 * to Base Sepolia's chain id and refuses to exist for any other network.
 * Amounts are fixed — the faucet is a starter grant, not a money API.
 */
export const FAUCET_CHAIN_ID = 84532;

export const FAUCET_NETWORK = getNetworkProfileByChainId(FAUCET_CHAIN_ID);

if (!FAUCET_NETWORK.testFunds) {
  throw new Error("The faucet network must be a test-funds network.");
}

export const GRANT_VERSION = "tab-base-sepolia-starter-v1";

/** 2.00 test USDC (6 decimals). */
export const GRANT_USDC_ATOMIC = 2_000_000n;

/** 0.001 test ETH for gas (18 decimals). */
export const GRANT_GAS_WEI = 1_000_000_000_000_000n;

/** Legs are skipped when the recipient already holds at least this much. */
export const SKIP_USDC_AT_ATOMIC = 1_000_000n;
export const SKIP_GAS_AT_WEI = 500_000_000_000_000n;

export const TEST_FUNDS_LABEL = "Test funds — not real money";
