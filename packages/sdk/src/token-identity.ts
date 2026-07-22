/**
 * Settlement token identity per environment. Hardcoded (not a workspace
 * dependency) because the SDK is published standalone: live settles USDC on
 * Arbitrum One; test settles real sandbox USDC on Base Sepolia.
 */
export const LIVE_TOKEN = {
  address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
  chainId: 42161,
} as const;

export const TEST_TOKEN = {
  address: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
  chainId: 84532,
} as const;

export type TokenChainId = typeof LIVE_TOKEN.chainId | typeof TEST_TOKEN.chainId;

export function tokenForMode(mode: "live" | "test") {
  return mode === "live" ? LIVE_TOKEN : TEST_TOKEN;
}

/** True when (chainId, address) is the expected pair for the mode. */
export function matchesTokenIdentity(
  mode: "live" | "test",
  chainId: unknown,
  address: unknown,
): address is string {
  const expected = tokenForMode(mode);
  return (
    chainId === expected.chainId &&
    typeof address === "string" &&
    address.toLowerCase() === expected.address
  );
}
