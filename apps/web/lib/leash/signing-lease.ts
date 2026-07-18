import { randomBytes } from "node:crypto";

import { and, eq, gte, sql } from "drizzle-orm";

import type { Database } from "../db/client";
import { agentEvents, receipts } from "../db/schema";
import { emitFloatEmpty } from "./notifier";
import type { SignGateCode } from "./sign-gate";
import { lockedSigningContext, terminalizeSigningReceipt } from "./signing-lease-context";
import { type FinalSigningPolicyCode, finalSigningPolicy } from "./signing-policy";

export const MAX_SIGNING_CLAIMS_PER_MINUTE = 20;
const DEFAULT_LEASE_SECONDS = 20;
const DIGEST = /^0x[0-9a-fA-F]{64}$/;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;
const TOKEN = /^[0-9a-f]{64}$/;

type SigningDeniedCode = FinalSigningPolicyCode | "SIGN_RATE_LIMITED";

interface ClaimOptions {
  agentId: string;
  allowExpiredReclaim?: boolean;
  digest: `0x${string}`;
  floatCheckedAt: Date;
  keyId: string;
  leaseSeconds?: number;
  liveBalanceAtomic: bigint;
  now?: Date;
  receiptId: string;
}

interface CompleteOptions {
  agentId: string;
  claimToken: string;
  digest: `0x${string}`;
  keyId: string;
  now?: Date;
  receiptId: string;
  signature: `0x${string}`;
}

function validDate(value: Date | undefined) {
  const date = value ?? new Date();
  if (!Number.isFinite(date.getTime())) throw new Error("The signing timestamp is invalid");
  return date;
}

function leaseSeconds(value: number | undefined) {
  const seconds = value ?? DEFAULT_LEASE_SECONDS;
  if (!Number.isSafeInteger(seconds) || seconds < 5 || seconds > 60) {
    throw new Error("The signing lease duration is invalid");
  }
  return seconds;
}

function denied(code: SigningDeniedCode, receiptId: string) {
  return { code, kind: "denied" as const, receiptId };
}

export async function claimSigningLease(database: Database, options: ClaimOptions) {
  if (!DIGEST.test(options.digest)) throw new Error("The signing digest is invalid");
  if (options.liveBalanceAtomic < BigInt(0)) throw new Error("Float balance cannot be negative");
  const now = validDate(options.now);
  const duration = leaseSeconds(options.leaseSeconds);
  return database.transaction(async (transaction) => {
    const context = await lockedSigningContext(transaction, options);
    if (!context.receipt) return denied(context.code, options.receiptId);
    if (context.code) return terminalizeSigningReceipt(transaction, context.receipt, context.code);
    const { agent, receipt } = context;
    if (receipt.status !== "pending") {
      return denied((receipt.reason as SignGateCode | null) ?? "SIGN_REQUEST_CONFLICT", receipt.id);
    }
    if (receipt.authorizationValidBefore <= now) {
      return terminalizeSigningReceipt(transaction, receipt, "AUTHORIZATION_EXPIRED");
    }
    if (
      receipt.signingDigest &&
      receipt.signingDigest.toLowerCase() !== options.digest.toLowerCase()
    ) {
      return denied("SIGN_REQUEST_CONFLICT", receipt.id);
    }
    if (receipt.signingClaimToken && receipt.signingLeaseExpiresAt) {
      if (receipt.signingLeaseExpiresAt > now) {
        return {
          kind: "in_progress" as const,
          receiptId: receipt.id,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((receipt.signingLeaseExpiresAt.getTime() - now.getTime()) / 1_000),
          ),
        };
      }
      if (!options.allowExpiredReclaim) {
        return { kind: "reconciliation_required" as const, receiptId: receipt.id };
      }
    }

    const policy = await finalSigningPolicy(transaction, {
      agentId: agent.id,
      floatCheckedAt: options.floatCheckedAt,
      liveBalanceAtomic: options.liveBalanceAtomic,
      now,
      receipt,
    });
    if (policy.code) {
      const result = await terminalizeSigningReceipt(transaction, receipt, policy.code);
      if (policy.code === "FLOAT_EMPTY") {
        if (!policy.cycleId || policy.reservedAtomic === undefined) {
          throw new Error("Float insufficiency requires an active cycle and reservation total");
        }
        await emitFloatEmpty(transaction, {
          agentId: agent.id,
          availableAtomic: options.liveBalanceAtomic.toString(),
          cycleId: policy.cycleId,
          network: receipt.network,
          now,
          receiptId: receipt.id,
          reservedAtomic: policy.reservedAtomic,
        });
      }
      return result;
    }
    if (receipt.signingSignature) {
      return {
        digest: receipt.signingDigest as `0x${string}`,
        kind: "signed" as const,
        receiptId: receipt.id,
        signature: receipt.signingSignature as `0x${string}`,
      };
    }

    const windowStart = new Date(now.getTime() - 60_000);
    const [rate] = await transaction
      .select({ count: sql<number>`count(*)::int` })
      .from(agentEvents)
      .where(
        and(
          eq(agentEvents.agentId, agent.id),
          eq(agentEvents.type, "sign"),
          gte(agentEvents.createdAt, windowStart),
          sql`${agentEvents.metadata} @> '{"signingClaim":true}'::jsonb`,
        ),
      );
    if (Number(rate?.count ?? 0) >= MAX_SIGNING_CLAIMS_PER_MINUTE) {
      return { kind: "rate_limited" as const, receiptId: receipt.id, retryAfterSeconds: 60 };
    }

    const claimToken = randomBytes(32).toString("hex");
    const leaseExpiresAt = new Date(now.getTime() + duration * 1_000);
    await transaction
      .update(receipts)
      .set({
        signedAt: null,
        signingClaimedAt: now,
        signingClaimToken: claimToken,
        signingDigest: options.digest.toLowerCase(),
        signingLeaseExpiresAt: leaseExpiresAt,
        signingSignature: null,
        signingAttempts: sql`${receipts.signingAttempts} + 1`,
      })
      .where(and(eq(receipts.id, receipt.id), eq(receipts.status, "pending")));
    await transaction.insert(agentEvents).values({
      actorSurface: "agent",
      agentId: agent.id,
      metadata: { receiptId: receipt.id, signingClaim: true },
      type: "sign",
    });
    return {
      address: agent.address as `0x${string}`,
      claimToken,
      digest: options.digest.toLowerCase() as `0x${string}`,
      kind: "claimed" as const,
      leaseExpiresAt,
      receiptId: receipt.id,
      subject: agent.subject as string,
    };
  });
}

export async function completeSigningLease(database: Database, options: CompleteOptions) {
  if (
    !TOKEN.test(options.claimToken) ||
    !DIGEST.test(options.digest) ||
    !SIGNATURE.test(options.signature)
  ) {
    throw new Error("The signing completion evidence is invalid");
  }
  const now = validDate(options.now);
  return database.transaction(async (transaction) => {
    const context = await lockedSigningContext(transaction, options);
    if (!context.receipt) return denied(context.code, options.receiptId);
    if (context.code) return terminalizeSigningReceipt(transaction, context.receipt, context.code);
    const { receipt } = context;
    if (receipt.status !== "pending") {
      return denied((receipt.reason as SignGateCode | null) ?? "SIGN_REQUEST_CONFLICT", receipt.id);
    }
    if (receipt.authorizationValidBefore <= now) {
      return terminalizeSigningReceipt(transaction, receipt, "AUTHORIZATION_EXPIRED");
    }
    if (receipt.signingSignature) {
      if (
        receipt.signingDigest?.toLowerCase() === options.digest.toLowerCase() &&
        receipt.signingSignature.toLowerCase() === options.signature.toLowerCase()
      ) {
        return {
          digest: receipt.signingDigest as `0x${string}`,
          kind: "signed" as const,
          receiptId: receipt.id,
          signature: receipt.signingSignature as `0x${string}`,
        };
      }
      return denied("SIGN_REQUEST_CONFLICT", receipt.id);
    }
    if (
      receipt.signingClaimToken !== options.claimToken ||
      receipt.signingDigest?.toLowerCase() !== options.digest.toLowerCase()
    ) {
      return denied("SIGN_REQUEST_CONFLICT", receipt.id);
    }
    await transaction
      .update(receipts)
      .set({
        signedAt: now,
        signingClaimedAt: null,
        signingClaimToken: null,
        signingDigest: options.digest.toLowerCase(),
        signingLeaseExpiresAt: null,
        signingSignature: options.signature,
      })
      .where(and(eq(receipts.id, receipt.id), eq(receipts.status, "pending")));
    return {
      digest: options.digest.toLowerCase() as `0x${string}`,
      kind: "signed" as const,
      receiptId: receipt.id,
      signature: options.signature,
    };
  });
}

export async function failSigningLease(
  database: Database,
  options: {
    agentId: string;
    claimToken: string;
    code: SignGateCode;
    receiptId: string;
  },
) {
  if (!TOKEN.test(options.claimToken)) throw new Error("The signing claim token is invalid");
  return database.transaction(async (transaction) => {
    const [receipt] = await transaction
      .select()
      .from(receipts)
      .where(and(eq(receipts.id, options.receiptId), eq(receipts.agentId, options.agentId)))
      .for("update");
    if (!receipt || receipt.signingClaimToken !== options.claimToken) return false;
    await terminalizeSigningReceipt(transaction, receipt, options.code);
    return true;
  });
}
