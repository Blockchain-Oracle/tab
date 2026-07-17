import { and, eq, isNull, sql } from "drizzle-orm";

import type { Database } from "../db/client";
import { agentEvents, agents, caps, leashKeys, receipts } from "../db/schema";
import { findActiveCapHalt } from "./cap-halt-store";
import { ensureCurrentCapCycle } from "./cycles";
import { emitFloatEmpty } from "./notifier";
import { floatReservationAt, receiptCommitted } from "./receipt-commitment";
import { type SignGateCode, SignGateError, statusGateError } from "./sign-gate";

const ATOMIC_UNITS_PER_CENT = BigInt(10_000);
type PreflightFailure = SignGateCode | "FLOAT_EMPTY" | "FLOAT_CHECK_UNAVAILABLE";

function terminalReceipt(receipt: typeof receipts.$inferSelect) {
  return { code: receipt.reason, kind: receipt.status, receiptId: receipt.id } as const;
}

async function failLockedReceipt(
  transaction: Parameters<Parameters<Database["transaction"]>[0]>[0],
  receipt: typeof receipts.$inferSelect,
  failure: PreflightFailure,
) {
  const blockedByCap = failure === "LEASH_CAP_EXCEEDED";
  const [terminalized] = await transaction
    .update(receipts)
    .set({
      intendedNetwork: blockedByCap ? receipt.network : null,
      reason: failure,
      settlementResponse: null,
      settledAt: null,
      status: blockedByCap ? "blocked" : "failed",
      txHash: null,
    })
    .where(and(eq(receipts.id, receipt.id), eq(receipts.status, "pending")))
    .returning({ id: receipts.id });
  if (!terminalized) throw new Error("The pending receipt changed during pre-sign checks");
  if (blockedByCap) {
    await transaction.insert(agentEvents).values({
      actorSurface: "agent",
      agentId: receipt.agentId,
      metadata: { receiptId: receipt.id },
      type: "block",
    });
  }
  return {
    code: failure,
    kind: blockedByCap ? ("blocked" as const) : ("failed" as const),
    receiptId: receipt.id,
  };
}

export async function completePreSigningChecks(
  db: Database,
  options: {
    agentId: string;
    keyId: string;
    liveBalanceAtomic: bigint;
    nowSeconds?: number;
    receiptId: string;
    signerAvailable: boolean;
  },
) {
  if (options.liveBalanceAtomic < BigInt(0)) throw new Error("Float balance cannot be negative");
  const checkedAt = new Date((options.nowSeconds ?? Math.floor(Date.now() / 1_000)) * 1_000);
  return db.transaction(async (transaction) => {
    const [agent] = await transaction
      .select({ id: agents.id, status: agents.status })
      .from(agents)
      .where(eq(agents.id, options.agentId))
      .for("update");
    if (!agent) throw new SignGateError("INVALID_LEASH_KEY", 401);

    const [receipt] = await transaction
      .select()
      .from(receipts)
      .where(and(eq(receipts.id, options.receiptId), eq(receipts.agentId, options.agentId)))
      .for("update");
    if (!receipt) throw new SignGateError("INVALID_LEASH_KEY", 401);
    if (receipt.status !== "pending") return terminalReceipt(receipt);

    const [key] = await transaction
      .select({ id: leashKeys.id })
      .from(leashKeys)
      .where(
        and(
          eq(leashKeys.id, options.keyId),
          eq(leashKeys.agentId, options.agentId),
          isNull(leashKeys.revokedAt),
        ),
      );
    if (!key) return failLockedReceipt(transaction, receipt, "INVALID_LEASH_KEY");

    const [cap] = await transaction
      .select({ amountUsdCents: caps.amountUsdCents, frequency: caps.frequency })
      .from(caps)
      .where(eq(caps.agentId, agent.id))
      .for("update");
    const cycle = cap
      ? await ensureCurrentCapCycle(transaction, {
          agentId: agent.id,
          frequency: cap.frequency,
          now: checkedAt,
        })
      : undefined;

    let failure: PreflightFailure | undefined = statusGateError(agent.status)?.code;
    if (!failure && receipt.authorizationValidBefore <= checkedAt) {
      failure = "AUTHORIZATION_EXPIRED";
    }

    if (!failure && (!cap?.amountUsdCents || !cycle)) failure = "LEASH_CAP_NOT_SET";
    if (!failure && cycle?.id !== receipt.cycleId) failure = "CAP_CYCLE_CHANGED";
    if (!failure && (await findActiveCapHalt(transaction, agent.id))) {
      failure = "LEASH_CAP_EXCEEDED";
    }

    if (!failure && cap?.amountUsdCents && cycle) {
      const [usage] = await transaction
        .select({ amountAtomic: sql<string>`coalesce(sum(${receipts.amountAtomic}), 0)::text` })
        .from(receipts)
        .where(
          and(eq(receipts.agentId, agent.id), eq(receipts.cycleId, cycle.id), receiptCommitted()),
        );
      if (BigInt(usage?.amountAtomic ?? "0") > BigInt(cap.amountUsdCents) * ATOMIC_UNITS_PER_CENT) {
        failure = "LEASH_CAP_EXCEEDED";
      }
    }

    let reservedAtomic: string | undefined;
    if (!failure) {
      const [reserved] = await transaction
        .select({ amountAtomic: sql<string>`coalesce(sum(${receipts.amountAtomic}), 0)::text` })
        .from(receipts)
        .where(
          and(
            eq(receipts.agentId, agent.id),
            eq(receipts.network, receipt.network),
            floatReservationAt(checkedAt),
          ),
        );
      reservedAtomic = reserved?.amountAtomic ?? "0";
      if (BigInt(reservedAtomic) > options.liveBalanceAtomic) {
        failure = "FLOAT_EMPTY";
      } else if (!options.signerAvailable) {
        failure = "SIGNER_NOT_CONFIGURED";
      }
    }
    if (failure) {
      const result = await failLockedReceipt(transaction, receipt, failure);
      if (failure === "FLOAT_EMPTY") {
        if (!cycle || reservedAtomic === undefined) {
          throw new Error("Float insufficiency requires an active cap cycle and reservation total");
        }
        await emitFloatEmpty(transaction, {
          agentId: agent.id,
          availableAtomic: options.liveBalanceAtomic.toString(),
          cycleId: cycle.id,
          network: receipt.network,
          now: checkedAt,
          receiptId: receipt.id,
          reservedAtomic,
        });
      }
      return result;
    }
    return { kind: "ready" as const, receiptId: receipt.id };
  });
}

export async function failSignRequestBeforeSigning(
  db: Database,
  options: {
    agentId: string;
    reason: "FLOAT_CHECK_UNAVAILABLE";
    receiptId: string;
  },
) {
  return db.transaction(async (transaction) => {
    await transaction
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.id, options.agentId))
      .for("update");
    const [receipt] = await transaction
      .select()
      .from(receipts)
      .where(and(eq(receipts.id, options.receiptId), eq(receipts.agentId, options.agentId)))
      .for("update");
    if (!receipt) throw new SignGateError("INVALID_LEASH_KEY", 401);
    if (receipt.status !== "pending") return terminalReceipt(receipt);
    return failLockedReceipt(transaction, receipt, options.reason);
  });
}
