import { isDeepStrictEqual } from "node:util";

import { and, eq, or, sql } from "drizzle-orm";
import { getAddress, isAddress } from "viem";

import type { Database } from "../db/client";
import { x402ResourceSettlementObservations } from "../db/schema";
import {
  normalizeX402ResourceSettlement,
  X402SettlementConflictError,
  x402ResourceInputFromSettlement,
} from "./x402-settlement-store";
import type { X402TestnetSettlement } from "./x402-testnet-resource";

export type X402RetryReason = "receipt_not_propagated" | "rpc_unavailable";

export interface X402RetryMetadata {
  attempts: number;
  paymentFingerprint: string;
  reason: X402RetryReason;
}

function rowSettlement(row: typeof x402ResourceSettlementObservations.$inferSelect) {
  return {
    amount: row.amountAtomic,
    asset: row.asset,
    authorizationValidAfter: BigInt(row.authorizationValidAfter.getTime() / 1_000).toString(),
    authorizationValidBefore: BigInt(row.authorizationValidBefore.getTime() / 1_000).toString(),
    endpoint: row.endpoint,
    facilitatorResponse: row.facilitatorResponse,
    facilitatorUrl: row.facilitatorUrl,
    network: row.network,
    nonce: row.nonce,
    payee: row.payee,
    payer: row.payer,
    testFunds: true,
    transactionHash: row.txHash,
  } as X402TestnetSettlement;
}

function values(settlement: X402TestnetSettlement, retry: X402RetryMetadata, now: Date) {
  if (
    !Number.isSafeInteger(retry.attempts) ||
    retry.attempts < 1 ||
    !/^[0-9a-f]{64}$/.test(retry.paymentFingerprint) ||
    (retry.reason !== "receipt_not_propagated" && retry.reason !== "rpc_unavailable")
  ) {
    throw new X402SettlementConflictError();
  }
  const normalized = normalizeX402ResourceSettlement(x402ResourceInputFromSettlement(settlement));
  return {
    amountAtomic: normalized.amountAtomic,
    asset: normalized.asset,
    authorizationValidAfter: normalized.authorizationValidAfter,
    authorizationValidBefore: normalized.authorizationValidBefore,
    endpoint: normalized.endpoint,
    facilitatorResponse: normalized.facilitatorResponse,
    facilitatorUrl: normalized.facilitatorUrl,
    lastCheckedAt: now,
    lastErrorCode: retry.reason,
    network: normalized.network,
    nonce: normalized.nonce,
    observedAt: now,
    payee: normalized.payee,
    payer: normalized.payer,
    paymentFingerprint: retry.paymentFingerprint,
    txHash: normalized.txHash,
    updatedAt: now,
    verificationAttempts: retry.attempts,
  };
}

function sameObservation(
  row: typeof x402ResourceSettlementObservations.$inferSelect,
  settlement: X402TestnetSettlement,
  fingerprint: string,
) {
  return (
    row.paymentFingerprint === fingerprint && isDeepStrictEqual(rowSettlement(row), settlement)
  );
}

export async function saveRetryableX402ResourceSettlement(
  database: Database,
  settlement: X402TestnetSettlement,
  retry: X402RetryMetadata,
) {
  const now = new Date();
  const insert = values(settlement, retry, now);
  const [created] = await database
    .insert(x402ResourceSettlementObservations)
    .values(insert)
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  const existingRows = await database
    .select()
    .from(x402ResourceSettlementObservations)
    .where(
      or(
        and(
          eq(x402ResourceSettlementObservations.network, insert.network),
          eq(x402ResourceSettlementObservations.payer, insert.payer),
          eq(x402ResourceSettlementObservations.nonce, insert.nonce),
        ),
        and(
          eq(x402ResourceSettlementObservations.network, insert.network),
          eq(x402ResourceSettlementObservations.txHash, insert.txHash),
        ),
      ),
    )
    .limit(2);
  const existing = existingRows[0];
  if (
    existingRows.length !== 1 ||
    !existing ||
    !sameObservation(existing, settlement, retry.paymentFingerprint)
  ) {
    throw new X402SettlementConflictError();
  }
  const [updated] = await database
    .update(x402ResourceSettlementObservations)
    .set({
      lastCheckedAt: now,
      lastErrorCode: retry.reason,
      updatedAt: now,
      verificationAttempts: sql`${x402ResourceSettlementObservations.verificationAttempts} + ${retry.attempts}`,
    })
    .where(eq(x402ResourceSettlementObservations.id, existing.id))
    .returning();
  if (!updated) throw new X402SettlementConflictError();
  return updated;
}

export async function findRetryableX402ResourceSettlement(
  database: Database,
  identity: { network: string; nonce: string; payer: string },
) {
  if (
    identity.network !== "eip155:84532" ||
    !isAddress(identity.payer) ||
    !/^0x[0-9a-fA-F]{64}$/.test(identity.nonce)
  ) {
    return null;
  }
  const [row] = await database
    .select()
    .from(x402ResourceSettlementObservations)
    .where(
      and(
        eq(x402ResourceSettlementObservations.network, identity.network),
        eq(x402ResourceSettlementObservations.payer, getAddress(identity.payer)),
        eq(x402ResourceSettlementObservations.nonce, identity.nonce.toLowerCase()),
      ),
    )
    .limit(1);
  return row
    ? { paymentFingerprint: row.paymentFingerprint, settlement: rowSettlement(row) }
    : null;
}
