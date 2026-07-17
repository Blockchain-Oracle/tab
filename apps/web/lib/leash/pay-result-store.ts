import { and, eq, sql } from "drizzle-orm";

import type { Database } from "../db/client";
import { agents, capCycles, caps, receipts } from "../db/schema";
import { emitCap75 } from "./notifier";
import { receiptCommitted } from "./receipt-commitment";
import { type parseSettlementObservation, verifySettlementOnchain } from "./settlement-evidence";

type SettlementEvidence = ReturnType<typeof parseSettlementObservation>;
type VerifySettlement = typeof verifySettlementOnchain;
const ATOMIC_UNITS_PER_CENT = BigInt(10_000);

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
  if (receipt.status === "settled" || (receipt.status === "failed" && receipt.txHash)) {
    const sameOutcome = evidence.success
      ? receipt.status === "settled"
      : receipt.status === "failed";
    if (!sameOutcome || receipt.txHash?.toLowerCase() !== evidence.transaction.toLowerCase()) {
      throw new SettlementResultConflictError();
    }
    return { kind: receipt.status, receiptId: receipt.id, verified: true } as const;
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
        authorizationValidBefore: receipts.authorizationValidBefore,
        cycleId: receipts.cycleId,
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
      );
    if (!row) return { kind: "not_found" as const };
    const reconcilingFailure =
      row.status === "failed" && row.txHash !== null && options.evidence.success;
    if (row.status !== "pending" && !reconcilingFailure) {
      return terminalResult(row, options.evidence);
    }
    if (!row.agentAddress) {
      return { kind: row.status, receiptId: row.id, verified: false } as const;
    }
    return {
      agentAddress: row.agentAddress,
      amountAtomic: row.amountAtomic,
      authorizationNonce: row.authorizationNonce as `0x${string}`,
      authorizationValidBefore: row.authorizationValidBefore,
      cycleId: row.cycleId,
      kind: "candidate" as const,
      network: row.network,
      payTo: row.payTo,
      priorRevertedTransaction: reconcilingFailure ? row.txHash : null,
      receiptId: row.id,
    };
  });
  if (candidate.kind !== "candidate") return candidate;

  const verify = options.verify ?? verifySettlementOnchain;
  const verified = await verify(options.evidence, {
    agentAddress: candidate.agentAddress,
    amountAtomic: candidate.amountAtomic,
    authorizationNonce: candidate.authorizationNonce,
    authorizationValidBefore: candidate.authorizationValidBefore,
    network: candidate.network,
    payTo: candidate.payTo,
  });
  if (!verified) {
    return { kind: "pending" as const, receiptId: candidate.receiptId, verified: false };
  }

  return db.transaction(async (transaction) => {
    const [agent] = await transaction
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.id, options.agentId))
      .for("update");
    if (!agent) return { kind: "not_found" as const };

    const [cap] = await transaction
      .select({ amountUsdCents: caps.amountUsdCents })
      .from(caps)
      .where(eq(caps.agentId, agent.id))
      .for("update");
    const [cycle] = await transaction
      .select({ id: capCycles.id })
      .from(capCycles)
      .where(and(eq(capCycles.id, candidate.cycleId), eq(capCycles.agentId, agent.id)))
      .for("update");
    if (!cycle) return { kind: "not_found" as const };

    const [current] = await transaction
      .select({ id: receipts.id, status: receipts.status, txHash: receipts.txHash })
      .from(receipts)
      .where(and(eq(receipts.id, candidate.receiptId), eq(receipts.agentId, options.agentId)))
      .for("update");
    if (!current) return { kind: "not_found" as const };
    const reconcilingFailure =
      current.status === "failed" && current.txHash !== null && options.evidence.success;
    if (current.status !== "pending" && !reconcilingFailure) {
      return terminalResult(current, options.evidence);
    }

    if (!options.evidence.success) {
      const [failed] = await transaction
        .update(receipts)
        .set({
          reason: options.evidence.errorReason,
          settlementResponse: {
            ...(options.evidence.errorMessage
              ? { errorMessage: options.evidence.errorMessage }
              : {}),
            errorReason: options.evidence.errorReason,
            network: options.evidence.network,
            payer: options.evidence.payer,
            proof: "reverted_matching_eip3009_call",
            success: false,
            transaction: options.evidence.transaction,
          },
          status: "failed",
          txHash: options.evidence.transaction,
        })
        .where(and(eq(receipts.id, current.id), eq(receipts.status, "pending")))
        .returning({ id: receipts.id });
      if (!failed) throw new SettlementResultConflictError();
      return { kind: "failed" as const, receiptId: failed.id, verified: true };
    }

    const settledAt = new Date();
    const [settled] = await transaction
      .update(receipts)
      .set({
        reason: null,
        settledAt,
        settlementResponse: {
          network: options.evidence.network,
          payer: options.evidence.payer,
          ...(reconcilingFailure ? { priorRevertedTransaction: current.txHash } : {}),
          proof: "usdc_transfer_and_authorization_used",
          success: true,
          transaction: options.evidence.transaction,
        },
        status: "settled",
        txHash: options.evidence.transaction,
      })
      .where(and(eq(receipts.id, current.id), eq(receipts.status, current.status)))
      .returning({ id: receipts.id });
    if (!settled) throw new SettlementResultConflictError();
    if (cap?.amountUsdCents) {
      const [usage] = await transaction
        .select({
          amountAtomic: sql<string>`coalesce(sum(${receipts.amountAtomic}), 0)::text`,
        })
        .from(receipts)
        .where(
          and(eq(receipts.agentId, agent.id), eq(receipts.cycleId, cycle.id), receiptCommitted()),
        );
      const committedAtomic = usage?.amountAtomic ?? "0";
      const capAtomic = (BigInt(cap.amountUsdCents) * ATOMIC_UNITS_PER_CENT).toString();
      if (BigInt(committedAtomic) * BigInt(100) >= BigInt(capAtomic) * BigInt(75)) {
        await emitCap75(transaction, {
          agentId: agent.id,
          capAtomic,
          committedAtomic,
          cycleId: cycle.id,
          now: settledAt,
        });
      }
    }
    return { kind: "settled" as const, receiptId: settled.id, verified: true };
  });
}
