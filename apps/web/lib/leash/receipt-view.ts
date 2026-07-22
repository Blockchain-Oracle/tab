import type { ReceiptOrigin } from "../db/schema";
import { formatUsdAtomic } from "./leash-format";
import { type LeashPaymentNetwork, paymentNetworkConfiguration } from "./payment-profile";

type Status = "pending" | "settled" | "failed" | "blocked";

export interface ReceiptViewSource {
  amountAtomic: string;
  amountUsd: string;
  asset: string;
  authorizationNonce: string;
  authorizationValidBefore: Date;
  capAtomicAtAttempt: string | null;
  committedAtomicBefore: string | null;
  createdAt: Date;
  id: string;
  intendedNetwork: LeashPaymentNetwork | null;
  network: LeashPaymentNetwork;
  origin: ReceiptOrigin | null;
  payTo: string;
  reason: string | null;
  resourceHost: string | null;
  resourceUrl: string | null;
  settledAt: Date | null;
  status: Status;
  txHash: string | null;
}

function explorerLabel(network: LeashPaymentNetwork) {
  if (network === "eip155:42161") return "View on Arbiscan";
  if (network === "eip155:84532") return "View on Base Sepolia Basescan";
  return "View on Basescan";
}

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
  const network = paymentNetworkConfiguration(networkId);
  const explorer =
    (receipt.status === "settled" || receipt.status === "failed") && receipt.txHash
      ? {
          href: `${network.explorerOrigin}/tx/${receipt.txHash}`,
          label: explorerLabel(networkId),
        }
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
    authorizationNonce: receipt.authorizationNonce,
    authorizationValidBefore: receipt.authorizationValidBefore.toISOString(),
    capContext,
    createdAt: receipt.createdAt.toISOString(),
    explorer,
    id: receipt.id,
    network: {
      id: networkId,
      label: network.label,
      target,
      testFunds: network.testFunds,
      ...(network.testFunds ? { testFundsLabel: "Testnet" } : {}),
    },
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
