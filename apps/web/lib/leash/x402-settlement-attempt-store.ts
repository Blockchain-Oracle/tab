import { isDeepStrictEqual } from "node:util";

import { and, eq, sql } from "drizzle-orm";
import { getAddress } from "viem";

import type { Database } from "../db/client";
import { x402ResourceSettlementAttempts, x402ResourceSettlements } from "../db/schema";
import { lockX402Authorization } from "./x402-settlement-lock";
import {
  normalizeX402ResourceSettlement,
  x402ResourceInputFromSettlement,
} from "./x402-settlement-store";
import type { X402TestnetSettlement, X402TestnetSettlementAttempt } from "./x402-testnet-resource";

export type DurableX402Attempt = X402TestnetSettlementAttempt & {
  facilitatorResponse: X402TestnetSettlement["facilitatorResponse"] | null;
  paymentFingerprint: string;
  startBlock: string;
  transactionHash: `0x${string}` | null;
};

function authorizationSeconds(value: Date) {
  return BigInt(value.getTime() / 1_000).toString();
}

function rowAttempt(row: typeof x402ResourceSettlementAttempts.$inferSelect): DurableX402Attempt {
  return {
    amount: "1000",
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    authorizationValidAfter: authorizationSeconds(row.authorizationValidAfter),
    authorizationValidBefore: authorizationSeconds(row.authorizationValidBefore),
    endpoint: row.endpoint,
    facilitatorResponse: row.facilitatorResponse as
      | X402TestnetSettlement["facilitatorResponse"]
      | null,
    facilitatorUrl: "https://x402.org/facilitator",
    network: "eip155:84532",
    nonce: row.nonce as `0x${string}`,
    payee: row.payee as `0x${string}`,
    payer: row.payer as `0x${string}`,
    paymentFingerprint: row.paymentFingerprint,
    startBlock: row.startBlock,
    testFunds: true,
    transactionHash: row.txHash as `0x${string}` | null,
  };
}

function attemptValues(
  attempt: X402TestnetSettlementAttempt,
  paymentFingerprint: string,
  startBlock: bigint,
) {
  if (!/^[0-9a-f]{64}$/.test(paymentFingerprint) || startBlock < BigInt(0)) {
    throw new Error("The x402 settlement attempt is invalid.");
  }
  const validAfter = BigInt(attempt.authorizationValidAfter);
  const validBefore = BigInt(attempt.authorizationValidBefore);
  return {
    amountAtomic: attempt.amount,
    asset: attempt.asset,
    authorizationValidAfter: new Date(Number(validAfter) * 1_000),
    authorizationValidBefore: new Date(Number(validBefore) * 1_000),
    endpoint: attempt.endpoint,
    facilitatorUrl: attempt.facilitatorUrl,
    network: attempt.network,
    nonce: attempt.nonce.toLowerCase(),
    payee: getAddress(attempt.payee),
    payer: getAddress(attempt.payer),
    paymentFingerprint,
    startBlock: startBlock.toString(),
  };
}

function sameAttempt(
  row: DurableX402Attempt,
  attempt: X402TestnetSettlementAttempt,
  fingerprint: string,
) {
  const {
    facilitatorResponse: _response,
    paymentFingerprint,
    startBlock: _block,
    transactionHash: _tx,
    ...identity
  } = row;
  return paymentFingerprint === fingerprint && isDeepStrictEqual(identity, attempt);
}

export async function beginX402SettlementAttempt(
  database: Database,
  attempt: X402TestnetSettlementAttempt,
  paymentFingerprint: string,
  startBlock: bigint,
) {
  const values = attemptValues(attempt, paymentFingerprint, startBlock);
  return database.transaction(async (transaction) => {
    const identity = { network: attempt.network, nonce: attempt.nonce, payer: attempt.payer };
    await lockX402Authorization(transaction, identity);
    const [final] = await transaction
      .select({ id: x402ResourceSettlements.id })
      .from(x402ResourceSettlements)
      .where(
        and(
          eq(x402ResourceSettlements.network, attempt.network),
          eq(x402ResourceSettlements.payer, attempt.payer),
          eq(x402ResourceSettlements.nonce, attempt.nonce),
        ),
      )
      .limit(1);
    if (final) return { attempt: null, created: false as const };
    const [created] = await transaction
      .insert(x402ResourceSettlementAttempts)
      .values(values)
      .onConflictDoNothing()
      .returning();
    if (created) return { attempt: rowAttempt(created), created: true as const };
    const [row] = await transaction
      .select()
      .from(x402ResourceSettlementAttempts)
      .where(
        and(
          eq(x402ResourceSettlementAttempts.network, attempt.network),
          eq(x402ResourceSettlementAttempts.payer, attempt.payer),
          eq(x402ResourceSettlementAttempts.nonce, attempt.nonce),
        ),
      )
      .limit(1);
    const existing = row ? rowAttempt(row) : null;
    if (!existing || !sameAttempt(existing, attempt, paymentFingerprint)) {
      throw new Error("The x402 settlement attempt conflicts with durable evidence.");
    }
    return { attempt: existing, created: false as const };
  });
}

export async function saveX402SettlementAttemptResult(
  database: Database,
  settlement: X402TestnetSettlement,
  paymentFingerprint: string,
) {
  const normalized = normalizeX402ResourceSettlement(
    x402ResourceInputFromSettlement(settlement, null, paymentFingerprint),
  );
  const [updated] = await database
    .update(x402ResourceSettlementAttempts)
    .set({
      facilitatorResponse: normalized.facilitatorResponse,
      txHash: normalized.txHash,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(x402ResourceSettlementAttempts.network, normalized.network),
        eq(x402ResourceSettlementAttempts.payer, normalized.payer),
        eq(x402ResourceSettlementAttempts.nonce, normalized.nonce),
        eq(x402ResourceSettlementAttempts.paymentFingerprint, paymentFingerprint),
      ),
    )
    .returning();
  if (!updated) throw new Error("The durable x402 settlement attempt is missing.");
  return rowAttempt(updated);
}

export async function noteX402SettlementAttemptRetry(
  database: Database,
  attempt: DurableX402Attempt,
  reason: "receipt_not_propagated" | "rpc_unavailable",
) {
  await database
    .update(x402ResourceSettlementAttempts)
    .set({
      lastErrorCode: reason,
      updatedAt: new Date(),
      verificationAttempts: sql`${x402ResourceSettlementAttempts.verificationAttempts} + 1`,
    })
    .where(
      and(
        eq(x402ResourceSettlementAttempts.network, attempt.network),
        eq(x402ResourceSettlementAttempts.payer, attempt.payer),
        eq(x402ResourceSettlementAttempts.nonce, attempt.nonce),
      ),
    );
}

export async function findX402SettlementAttempt(
  database: Database,
  identity: { network: string; nonce: string; payer: string },
) {
  const [row] = await database
    .select()
    .from(x402ResourceSettlementAttempts)
    .where(
      and(
        eq(x402ResourceSettlementAttempts.network, identity.network as "eip155:84532"),
        sql`lower(${x402ResourceSettlementAttempts.payer}) = lower(${identity.payer})`,
        eq(x402ResourceSettlementAttempts.nonce, identity.nonce.toLowerCase()),
      ),
    )
    .limit(1);
  return row ? rowAttempt(row) : null;
}
