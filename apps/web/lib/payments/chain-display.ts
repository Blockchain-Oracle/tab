import { getNetworkProfileByChainId } from "@tab/networks";

export type ChainDisplay = {
  assetId: "arbitrum" | "base" | undefined;
  explorerTxUrl: ((hash: string) => string) | undefined;
  label: string;
  testFunds: boolean;
};

/**
 * Canonical chain identity for a settlement row, derived from the recorded
 * token_chain_id — never hardcoded. Unknown ids render truthfully as
 * "Chain <id>" with no explorer link instead of guessing.
 */
export function chainDisplay(chainId: number): ChainDisplay {
  try {
    const profile = getNetworkProfileByChainId(chainId);
    return {
      assetId: profile.officialAssetId,
      explorerTxUrl: (hash: string) => `${profile.explorerOrigin}/tx/${hash}`,
      label: profile.displayName,
      testFunds: profile.testFunds,
    };
  } catch {
    return {
      assetId: undefined,
      explorerTxUrl: undefined,
      label: `Chain ${chainId}`,
      testFunds: false,
    };
  }
}
