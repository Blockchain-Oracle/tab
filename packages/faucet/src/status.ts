export type FaucetAsset = "gas" | "usdc";

export type FaucetLegState = "already-funded" | "failed" | "funded" | "unavailable";

export interface FaucetLegReport {
  asset: FaucetAsset;
  /** Human-readable reason when not funded; rendered verbatim by the UI. */
  blocker?: string;
  explorerTxUrl?: string;
  state: FaucetLegState;
  txHash?: string;
}

export type FaucetGrantState = "funded" | "partial" | "unavailable";

export interface FaucetGrantReport {
  label: string;
  legs: FaucetLegReport[];
  network: { caip2: string; chainId: number; displayName: string };
  state: FaucetGrantState;
  version: string;
}

/** Overall state derives from the legs: any funded/already leg counts. */
export function grantState(legs: FaucetLegReport[]): FaucetGrantState {
  const good = legs.filter((leg) => leg.state === "funded" || leg.state === "already-funded");
  if (good.length === legs.length) return "funded";
  if (good.length > 0) return "partial";
  return "unavailable";
}
