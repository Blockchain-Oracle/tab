import { and, eq, isNull } from "drizzle-orm";

import type { Database } from "../db/client";
import { agentEvents, agents, leashKeys, receipts } from "../db/schema";
import { statusGateError } from "./sign-gate";
import type { FinalSigningPolicyCode } from "./signing-policy";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function terminalizeSigningReceipt(
  transaction: Transaction,
  receipt: typeof receipts.$inferSelect,
  code: FinalSigningPolicyCode,
) {
  const blocked = code === "LEASH_CAP_EXCEEDED";
  await transaction
    .update(receipts)
    .set({
      intendedNetwork: blocked ? receipt.network : null,
      reason: code,
      signedAt: null,
      signingClaimedAt: null,
      signingClaimToken: null,
      signingDigest: null,
      signingLeaseExpiresAt: null,
      signingSignature: null,
      status: blocked ? "blocked" : "failed",
    })
    .where(and(eq(receipts.id, receipt.id), eq(receipts.status, "pending")));
  if (blocked) {
    await transaction.insert(agentEvents).values({
      actorSurface: "agent",
      agentId: receipt.agentId,
      metadata: { receiptId: receipt.id },
      type: "block",
    });
  }
  return { code, kind: "denied" as const, receiptId: receipt.id };
}

export async function lockedSigningContext(
  transaction: Transaction,
  options: { agentId: string; keyId: string; receiptId: string },
) {
  const [agent] = await transaction
    .select({
      address: agents.agentAddress,
      id: agents.id,
      status: agents.status,
      subject: agents.signerSubject,
    })
    .from(agents)
    .where(eq(agents.id, options.agentId))
    .for("update");
  if (!agent) return { code: "INVALID_LEASH_KEY" as const };
  const [receipt] = await transaction
    .select()
    .from(receipts)
    .where(and(eq(receipts.id, options.receiptId), eq(receipts.agentId, agent.id)))
    .for("update");
  if (!receipt) return { code: "INVALID_LEASH_KEY" as const };
  const [key] = await transaction
    .select({ id: leashKeys.id })
    .from(leashKeys)
    .where(
      and(
        eq(leashKeys.id, options.keyId),
        eq(leashKeys.agentId, agent.id),
        isNull(leashKeys.revokedAt),
      ),
    );
  const statusError = statusGateError(agent.status);
  if (statusError) return { agent, code: statusError.code, receipt };
  if (!key) return { agent, code: "INVALID_LEASH_KEY" as const, receipt };
  if (!agent.address || !agent.subject) {
    return { agent, code: "SIGNER_NOT_CONFIGURED" as const, receipt };
  }
  return { agent, receipt };
}
