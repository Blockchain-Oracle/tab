import { and, eq, sql } from "drizzle-orm";

import type { Database } from "../db/client";
import {
  agents,
  receipts,
  x402ResourceSettlementAttempts,
  x402ResourceSettlementObservations,
} from "../db/schema";
import { applySettlementObservation } from "./pay-result-store";
import { parseSettlementObservation } from "./settlement-evidence";
import { lockX402Authorization } from "./x402-settlement-lock";
import {
  recordX402ResourceSettlement,
  X402SettlementConflictError,
  x402ResourceInputFromSettlement,
} from "./x402-settlement-store";
import type { X402TestnetSettlement } from "./x402-testnet-resource";

async function matchingReceipt(database: Database, settlement: X402TestnetSettlement) {
  const rows = await database
    .select({ agentId: receipts.agentId, receiptId: receipts.id })
    .from(receipts)
    .innerJoin(agents, eq(agents.id, receipts.agentId))
    .where(
      and(
        eq(receipts.network, settlement.network),
        eq(receipts.amountAtomic, settlement.amount),
        eq(receipts.authorizationNonce, settlement.nonce.toLowerCase()),
        sql`lower(${receipts.asset}) = lower(${settlement.asset})`,
        sql`lower(${receipts.payTo}) = lower(${settlement.payee})`,
        sql`lower(${agents.agentAddress}) = lower(${settlement.payer})`,
      ),
    )
    .limit(2);
  if (rows.length > 1) throw new X402SettlementConflictError();
  return rows[0] ?? null;
}

async function finalizeMatchingReceipt(
  database: Database,
  settlement: X402TestnetSettlement,
  match: { agentId: string; receiptId: string },
) {
  const evidence = parseSettlementObservation({
    outcome: "observed",
    paymentResponse: {
      network: settlement.network,
      payer: settlement.payer,
      success: true,
      transaction: settlement.transactionHash,
    },
    receiptId: match.receiptId,
  });
  const finalized = await applySettlementObservation(database, {
    agentId: match.agentId,
    evidence,
    verify: async () => true,
  });
  if (finalized.kind !== "settled" || !finalized.verified) {
    throw new X402SettlementConflictError();
  }
}

export async function commitVerifiedX402ResourceSettlement(
  database: Database,
  settlement: X402TestnetSettlement,
  paymentFingerprint: string,
) {
  return database.transaction(async (transaction) => {
    await lockX402Authorization(transaction, settlement);
    const transactionalDatabase = transaction as unknown as Database;
    const match = await matchingReceipt(transactionalDatabase, settlement);
    if (match) await finalizeMatchingReceipt(transactionalDatabase, settlement, match);
    const committed = await recordX402ResourceSettlement(
      transactionalDatabase,
      x402ResourceInputFromSettlement(settlement, match?.receiptId ?? null, paymentFingerprint),
    );
    await transaction
      .delete(x402ResourceSettlementObservations)
      .where(
        and(
          eq(x402ResourceSettlementObservations.network, settlement.network),
          eq(x402ResourceSettlementObservations.payer, settlement.payer),
          eq(x402ResourceSettlementObservations.nonce, settlement.nonce.toLowerCase()),
          eq(x402ResourceSettlementObservations.txHash, settlement.transactionHash.toLowerCase()),
        ),
      );
    await transaction
      .delete(x402ResourceSettlementAttempts)
      .where(
        and(
          eq(x402ResourceSettlementAttempts.network, settlement.network),
          eq(x402ResourceSettlementAttempts.payer, settlement.payer),
          eq(x402ResourceSettlementAttempts.nonce, settlement.nonce.toLowerCase()),
        ),
      );
    return committed;
  });
}
