import type { ReceiptOrigin } from "../db/schema";
import { formatUsdAtomic } from "./leash-format";

type Network = "eip155:8453" | "eip155:42161";
type Status = "pending" | "settled" | "failed" | "blocked";

export interface ReceiptViewSource {
  amountAtomic: string;
  amountUsd: string;
  asset: string;
  capAtomicAtAttempt: string | null;
  committedAtomicBefore: string | null;
  createdAt: Date;
  id: string;
  intendedNetwork: Network | null;
  network: Network;
  origin: ReceiptOrigin | null;
  payTo: string;
  reason: string | null;
  resourceHost: string | null;
  resourceUrl: string | null;
  settledAt: Date | null;
  status: Status;
  txHash: string | null;
}

const networks = {
  "eip155:42161": {
    explorer: "https://arbiscan.io/tx/",
    explorerLabel: "View on Arbiscan",
    label: "Arbitrum",
  },
  "eip155:8453": {
    explorer: "https://basescan.org/tx/",
    explorerLabel: "View on Basescan",
    label: "Base",
  },
} as const;

function originView(origin: ReceiptOrigin | null) {
  if (!origin || (origin.transport !== "http" && origin.transport !== "mcp")) return null;
  return {
    ...(typeof origin.clientName === "string" ? { clientName: origin.clientName } : {}),
    ...(typeof origin.toolName === "string" ? { toolName: origin.toolName } : {}),
    transport: origin.transport,
  };
}

export function receiptView(receipt: ReceiptViewSource) {
  const target = receipt.status === "blocked" && receipt.intendedNetwork !== null;
  const networkId =
    receipt.status === "blocked" && receipt.intendedNetwork
      ? receipt.intendedNetwork
      : receipt.network;
  const network = networks[networkId];
  const explorer =
    (receipt.status === "settled" || receipt.status === "failed") && receipt.txHash
      ? { href: `${network.explorer}${receipt.txHash}`, label: network.explorerLabel }
      : null;
  const capContext =
    receipt.capAtomicAtAttempt !== null && receipt.committedAtomicBefore !== null
      ? {
          capAtomic: receipt.capAtomicAtAttempt,
          committedBeforeAtomic: receipt.committedAtomicBefore,
          projectedAfterAtomic: (
            BigInt(receipt.committedAtomicBefore) + BigInt(receipt.amountAtomic)
          ).toString(),
        }
      : null;
  return {
    amountAtomic: receipt.amountAtomic,
    amountDisplay: formatUsdAtomic(receipt.amountAtomic),
    amountUsd: receipt.amountUsd,
    asset: "USDC" as const,
    capContext,
    createdAt: receipt.createdAt.toISOString(),
    explorer,
    id: receipt.id,
    network: { id: networkId, label: network.label, target },
    origin: originView(receipt.origin),
    payTo: receipt.payTo,
    reason: receipt.reason,
    resourceHost: receipt.resourceHost,
    resourceUrl: receipt.resourceUrl,
    settledAt: receipt.settledAt?.toISOString() ?? null,
    status: receipt.status,
    txHash: receipt.txHash,
  };
}
