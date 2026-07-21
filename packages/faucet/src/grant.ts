import type { FaucetFunder } from "./funder";
import {
  FAUCET_NETWORK,
  GRANT_VERSION,
  SKIP_GAS_AT_WEI,
  SKIP_USDC_AT_ATOMIC,
  TEST_FUNDS_LABEL,
} from "./policy";
import { type FaucetGrantReport, type FaucetLegReport, grantState } from "./status";

function explorerTxUrl(hash: string) {
  return `${FAUCET_NETWORK.explorerOrigin}/tx/${hash}`;
}

/**
 * Execute one starter grant. Never throws for money-path reasons: every leg
 * resolves to a truthful status the UI renders verbatim. Real transfers only
 * — a leg is `funded` exactly when its receipt confirmed with success status.
 */
export async function executeGrant(
  funder: FaucetFunder,
  recipient: string,
): Promise<FaucetGrantReport> {
  const legs: FaucetLegReport[] = [];

  let balances: Awaited<ReturnType<FaucetFunder["readBalances"]>>;
  try {
    balances = await funder.readBalances(recipient);
  } catch {
    return report([
      {
        asset: "gas",
        blocker: "The Base Sepolia read failed. Try again shortly.",
        state: "unavailable",
      },
      {
        asset: "usdc",
        blocker: "The Base Sepolia read failed. Try again shortly.",
        state: "unavailable",
      },
    ]);
  }

  try {
    const ready = await funder.preflight();
    if (!ready.funded) {
      return report([
        {
          asset: "gas",
          blocker: "The faucet treasury is low. Ask the operator to refill it.",
          state: "unavailable",
        },
        {
          asset: "usdc",
          blocker: "The faucet treasury is low. Ask the operator to refill it.",
          state: "unavailable",
        },
      ]);
    }
  } catch {
    return report([
      { asset: "gas", blocker: "The faucet treasury could not be read.", state: "unavailable" },
      { asset: "usdc", blocker: "The faucet treasury could not be read.", state: "unavailable" },
    ]);
  }

  if (balances.gasWei >= SKIP_GAS_AT_WEI) {
    legs.push({ asset: "gas", state: "already-funded" });
  } else {
    try {
      const hash = await funder.sendGas(recipient);
      legs.push({
        asset: "gas",
        explorerTxUrl: explorerTxUrl(hash),
        state: "funded",
        txHash: hash,
      });
    } catch {
      legs.push({ asset: "gas", blocker: "The gas transfer did not confirm.", state: "failed" });
    }
  }

  if (balances.usdcAtomic >= SKIP_USDC_AT_ATOMIC) {
    legs.push({ asset: "usdc", state: "already-funded" });
  } else {
    try {
      const hash = await funder.sendUsdc(recipient);
      legs.push({
        asset: "usdc",
        explorerTxUrl: explorerTxUrl(hash),
        state: "funded",
        txHash: hash,
      });
    } catch {
      legs.push({ asset: "usdc", blocker: "The USDC transfer did not confirm.", state: "failed" });
    }
  }

  return report(legs);
}

function report(legs: FaucetLegReport[]): FaucetGrantReport {
  return {
    label: TEST_FUNDS_LABEL,
    legs,
    network: {
      caip2: FAUCET_NETWORK.caip2,
      chainId: FAUCET_NETWORK.chainId,
      displayName: FAUCET_NETWORK.displayName,
    },
    state: grantState(legs),
    version: GRANT_VERSION,
  };
}
