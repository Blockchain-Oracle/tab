import { and, eq } from "drizzle-orm";

import type { Database } from "../db/client";
import { agents, receipts } from "../db/schema";
import { type parseSettlementObservation, verifySettlementOnchain } from "./settlement-evidence";

type SettlementEvidence = ReturnType<typeof parseSettlementObservation>;
type VerifySettlement = typeof verifySettlementOnchain;

export class SettlementResultConflictError extends Error {
  readonly code = "SETTLEMENT_RESULT_CONFLICT";
  readonly status = 409;

  constructor() {
    super("The receipt already has different terminal evidence.");
    this.name = "SettlementResultConflictError";
  }
}

function terminalResult(
  receipt: Pick<typeof receipts.$inferSelect, "id" | "status" | "txHash">,
  evidence: SettlementEvidence,
) {
  if (receipt.status === "settled") {
    if (receipt.txHash?.toLowerCase() !== evidence.transaction.toLowerCase()) {
      throw new SettlementResultConflictError();
    }
    return { kind: "settled" as const, receiptId: receipt.id, verified: true };
  }
  return { kind: receipt.status, receiptId: receipt.id, verified: false } as const;
}

export async function applySettlementObservation(
  db: Database,
  options: {
    agentId: string;
    evidence: SettlementEvidence;
    verify?: VerifySettlement;
  },
) {
  const candidate = await db.transaction(async (transaction) => {
    const [row] = await transaction
      .select({
        agentAddress: agents.agentAddress,
        amountAtomic: receipts.amountAtomic,
        authorizationNonce: receipts.authorizationNonce,
        id: receipts.id,
        network: receipts.network,
        payTo: receipts.payTo,
        status: receipts.status,
        txHash: receipts.txHash,
      })
      .from(receipts)
      .innerJoin(agents, eq(agents.id, receipts.agentId))
      .where(
        and(eq(receipts.id, options.evidence.receiptId), eq(receipts.agentId, options.agentId)),
      )
      .for("update");
    if (!row) return { kind: "not_found" as const };
    if (row.status !== "pending") return terminalResult(row, options.evidence);
    if (!row.agentAddress) {
      return { kind: "pending" as const, receiptId: row.id, verified: false };
    }
    return {
      agentAddress: row.agentAddress,
      amountAtomic: row.amountAtomic,
      authorizationNonce: row.authorizationNonce as `0x${string}`,
      kind: "candidate" as const,
      network: row.network,
      payTo: row.payTo,
      receiptId: row.id,
    };
  });
  if (candidate.kind !== "candidate") return candidate;

  const verify = options.verify ?? verifySettlementOnchain;
  const verified = await verify(options.evidence, {
    agentAddress: candidate.agentAddress,
    amountAtomic: candidate.amountAtomic,
    authorizationNonce: candidate.authorizationNonce,
    network: candidate.network,
    payTo: candidate.payTo,
  });
  if (!verified) {
    return { kind: "pending" as const, receiptId: candidate.receiptId, verified: false };
  }

  return db.transaction(async (transaction) => {
    const [current] = await transaction
      .select({ id: receipts.id, status: receipts.status, txHash: receipts.txHash })
      .from(receipts)
      .where(and(eq(receipts.id, candidate.receiptId), eq(receipts.agentId, options.agentId)))
      .for("update");
    if (!current) return { kind: "not_found" as const };
    if (current.status !== "pending") return terminalResult(current, options.evidence);

    const [settled] = await transaction
      .update(receipts)
      .set({
        settledAt: new Date(),
        settlementResponse: {
          network: options.evidence.network,
          payer: options.evidence.payer,
          proof: "usdc_transfer_and_authorization_used",
          success: true,
          transaction: options.evidence.transaction,
        },
        status: "settled",
        txHash: options.evidence.transaction,
      })
      .where(and(eq(receipts.id, current.id), eq(receipts.status, "pending")))
      .returning({ id: receipts.id });
    if (!settled) throw new SettlementResultConflictError();
    return { kind: "settled" as const, receiptId: settled.id, verified: true };
  });
}
