import { getNetworkProfile } from "@tab/networks";
import { and, eq, isNotNull } from "drizzle-orm";

import type { Database } from "../db/client";
import { receipts } from "../db/schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ShareableReceipt = {
  amountUsd: string;
  explorerTxUrl: string | undefined;
  id: string;
  networkCaip2: string;
  networkName: string;
  resourceHost: string | null;
  settledAt: Date;
  testFunds: boolean;
  txHash: string;
};

/**
 * The public share read: SETTLED receipts only, by unguessable UUID, and
 * only the evidence itself — amount, network, hash, time, resource host.
 * Never the owner, the agent, or any cap context.
 */
export async function readShareableReceipt(
  db: Database,
  id: string,
): Promise<ShareableReceipt | null> {
  if (!UUID.test(id)) return null;

  const [row] = await db
    .select({
      amountUsd: receipts.amountUsd,
      id: receipts.id,
      network: receipts.network,
      resourceHost: receipts.resourceHost,
      settledAt: receipts.settledAt,
      txHash: receipts.txHash,
    })
    .from(receipts)
    .where(and(eq(receipts.id, id), eq(receipts.status, "settled"), isNotNull(receipts.txHash)))
    .limit(1);

  if (!row?.txHash || !row.settledAt) return null;

  let networkName: string = row.network;
  let explorerTxUrl: string | undefined;
  let testFunds = false;
  try {
    const profile = getNetworkProfile(row.network);
    networkName = profile.displayName;
    explorerTxUrl = `${profile.explorerOrigin}/tx/${row.txHash}`;
    testFunds = profile.testFunds;
  } catch {
    // Unknown network: render the recorded CAIP-2 truthfully, no link.
  }

  return {
    amountUsd: row.amountUsd,
    explorerTxUrl,
    id: row.id,
    networkCaip2: row.network,
    networkName,
    resourceHost: row.resourceHost,
    settledAt: row.settledAt,
    testFunds,
    txHash: row.txHash,
  };
}

export function formatShareAmount(amountUsd: string) {
  const value = Number(amountUsd);
  if (!Number.isFinite(value)) return `$${amountUsd}`;
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(value);
}
