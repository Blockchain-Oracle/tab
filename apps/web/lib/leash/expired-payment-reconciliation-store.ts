import { and, asc, eq, lte } from "drizzle-orm";

import type { Database } from "../db/client";
import { agents, receipts } from "../db/schema";
import { readFinalizedAuthorizationUsed } from "./authorization-state";

type AuthorizationUsed = typeof readFinalizedAuthorizationUsed;
export const MAX_EXPIRED_RECEIPT_RECONCILIATIONS = 4;
type ReceiptState = Pick<
  typeof receipts.$inferSelect,
  "id" | "reason" | "settlementResponse" | "status" | "txHash"
>;

function verifiedRevertedEvidence(receipt: ReceiptState) {
  const response = receipt.settlementResponse;
  return (
    receipt.status === "failed" &&
    receipt.txHash !== null &&
    typeof response === "object" &&
    response !== null &&
    !Array.isArray(response) &&
    response.proof === "reverted_matching_eip3009_call" &&
    response.success === false &&
    typeof response.transaction === "string" &&
    response.transaction.toLowerCase() === receipt.txHash.toLowerCase()
  );
}

function existingResult(receipt: ReceiptState) {
  if (
    receipt.status === "failed" &&
    receipt.reason === "AUTHORIZATION_EXPIRED" &&
    ((receipt.txHash === null && receipt.settlementResponse === null) ||
      verifiedRevertedEvidence(receipt))
  ) {
    return { kind: "failed" as const, receiptId: receipt.id, verified: true };
  }
  if (receipt.status !== "pending" && !verifiedRevertedEvidence(receipt)) {
    return { kind: "conflict" as const, receiptId: receipt.id, verified: false };
  }
  return null;
}

export async function reconcileExpiredPaymentReceipt(
  db: Database,
  options: {
    agentId: string;
    authorizationUsed?: AuthorizationUsed;
    receiptId: string;
  },
) {
  const [candidate] = await db
    .select({
      agentAddress: agents.agentAddress,
      asset: receipts.asset,
      authorizationNonce: receipts.authorizationNonce,
      authorizationValidBefore: receipts.authorizationValidBefore,
      id: receipts.id,
      network: receipts.network,
      reason: receipts.reason,
      settlementResponse: receipts.settlementResponse,
      status: receipts.status,
      txHash: receipts.txHash,
    })
    .from(receipts)
    .innerJoin(agents, eq(agents.id, receipts.agentId))
    .where(and(eq(receipts.id, options.receiptId), eq(receipts.agentId, options.agentId)));
  if (!candidate) return { kind: "not_found" as const };
  const terminal = existingResult(candidate);
  if (terminal) return terminal;
  const pending = {
    kind: "pending" as const,
    receiptId: candidate.id,
    verified: false,
  };
  if (!candidate.agentAddress) return pending;

  let used: boolean;
  try {
    used = await (options.authorizationUsed ?? readFinalizedAuthorizationUsed)({
      network: candidate.network,
      nonce: candidate.authorizationNonce,
      payer: candidate.agentAddress,
      validBeforeSeconds: Math.floor(candidate.authorizationValidBefore.getTime() / 1_000),
    });
  } catch {
    return pending;
  }
  if (used) return pending;

  return db.transaction(async (transaction) => {
    const [current] = await transaction
      .select({
        id: receipts.id,
        reason: receipts.reason,
        settlementResponse: receipts.settlementResponse,
        status: receipts.status,
        txHash: receipts.txHash,
      })
      .from(receipts)
      .where(and(eq(receipts.id, candidate.id), eq(receipts.agentId, options.agentId)))
      .for("update");
    if (!current) return { kind: "not_found" as const };
    const currentTerminal = existingResult(current);
    if (currentTerminal) return currentTerminal;

    const preserveRevertedEvidence = verifiedRevertedEvidence(current);
    const [failed] = await transaction
      .update(receipts)
      .set({
        intendedNetwork: null,
        reason: "AUTHORIZATION_EXPIRED",
        settledAt: null,
        ...(preserveRevertedEvidence ? {} : { settlementResponse: null, txHash: null }),
        signedAt: null,
        signingClaimedAt: null,
        signingClaimToken: null,
        signingDigest: null,
        signingLeaseExpiresAt: null,
        signingSignature: null,
        status: "failed",
      })
      .where(
        and(
          eq(receipts.id, current.id),
          eq(receipts.agentId, options.agentId),
          eq(receipts.status, current.status),
        ),
      )
      .returning({ id: receipts.id });
    if (!failed) {
      return { kind: "conflict" as const, receiptId: current.id, verified: false };
    }
    return { kind: "failed" as const, receiptId: failed.id, verified: true };
  });
}

export async function reconcileExpiredPendingReceipts(
  db: Database,
  options: {
    agentId: string;
    authorizationUsed?: AuthorizationUsed;
    now?: Date;
  },
) {
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("The reconciliation timestamp is invalid");
  const candidates = await db
    .select({ id: receipts.id })
    .from(receipts)
    .where(
      and(
        eq(receipts.agentId, options.agentId),
        eq(receipts.status, "pending"),
        lte(receipts.authorizationValidBefore, now),
      ),
    )
    .orderBy(asc(receipts.authorizationValidBefore), asc(receipts.id))
    .limit(MAX_EXPIRED_RECEIPT_RECONCILIATIONS);

  return Promise.all(
    candidates.map(({ id }) =>
      reconcileExpiredPaymentReceipt(db, {
        agentId: options.agentId,
        ...(options.authorizationUsed ? { authorizationUsed: options.authorizationUsed } : {}),
        receiptId: id,
      }),
    ),
  );
}
