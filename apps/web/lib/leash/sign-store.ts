import { and, eq, isNull, sql } from "drizzle-orm";

import type { Database } from "../db/client";
import { agentEvents, agents, caps, leashKeys, receipts } from "../db/schema";
import { findActiveCapHalt } from "./cap-halt-store";
import { ensureCurrentCapCycle } from "./cycles";
import { emitCapBlocked, emitUnusualDomain } from "./notifier";
import { receiptCommitted } from "./receipt-commitment";
import { preParseStatusGateError, SignGateError } from "./sign-gate";
import { InvalidSignRequestError, parseSignRequest } from "./sign-request";

export { SignGateError } from "./sign-gate";
export {
  completePreSigningChecks,
  failSignRequestBeforeSigning,
} from "./sign-preflight-store";

const ATOMIC_UNITS_PER_CENT = BigInt(10_000);

function amountUsd(amountAtomic: string) {
  const value = BigInt(amountAtomic);
  return `${value / BigInt(1_000_000)}.${(value % BigInt(1_000_000)).toString().padStart(6, "0")}`;
}

function decodeBody(body: unknown) {
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new InvalidSignRequestError();
  }
}

function pendingResult(
  receiptId: string,
  parsed: ReturnType<typeof parseSignRequest>,
  agentAddress: string,
  replayed: boolean,
) {
  return {
    agentAddress,
    amountAtomic: parsed.amountAtomic,
    authorizationNonce: parsed.authorizationNonce,
    kind: "pending" as const,
    network: parsed.network,
    receiptId,
    replayed,
    signerRequest: parsed.signerRequest,
  };
}

function matchesRequestSemantics(
  existing: typeof receipts.$inferSelect,
  parsed: ReturnType<typeof parseSignRequest>,
) {
  return (
    existing.network === parsed.network &&
    existing.asset.toLowerCase() === parsed.asset.toLowerCase() &&
    existing.payTo.toLowerCase() === parsed.payTo.toLowerCase() &&
    BigInt(existing.amountAtomic) === BigInt(parsed.amountAtomic) &&
    existing.authorizationValidBefore.getTime() === parsed.authorizationValidBefore.getTime()
  );
}

export async function reserveSignRequest(
  db: Database,
  options: {
    agentId: string;
    body: unknown;
    keyId: string;
    nowSeconds?: number;
  },
) {
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1_000);
  const now = new Date(nowSeconds * 1_000);
  return db.transaction(async (transaction) => {
    const [agent] = await transaction
      .select({
        address: agents.agentAddress,
        id: agents.id,
        paymentProfile: agents.paymentProfile,
        status: agents.status,
      })
      .from(agents)
      .where(eq(agents.id, options.agentId))
      .for("update");
    if (!agent) throw new SignGateError("INVALID_LEASH_KEY", 401);

    const blockedStatus = preParseStatusGateError(agent.status);
    if (blockedStatus) throw blockedStatus;
    if (!agent.address) throw new SignGateError("SIGNER_NOT_CONFIGURED", 503);

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
    if (!key) throw new SignGateError("INVALID_LEASH_KEY", 401);

    const parsed = parseSignRequest(decodeBody(options.body), {
      agentAddress: agent.address,
      nowSeconds,
      paymentProfile: agent.paymentProfile,
    });
    const [cap] = await transaction
      .select({ amountUsdCents: caps.amountUsdCents, frequency: caps.frequency })
      .from(caps)
      .where(eq(caps.agentId, agent.id))
      .for("update");
    if (!cap?.amountUsdCents) throw new SignGateError("LEASH_CAP_NOT_SET", 403);
    const cycle = await ensureCurrentCapCycle(transaction, {
      agentId: agent.id,
      frequency: cap.frequency,
      now,
    });
    if (!cycle) throw new SignGateError("LEASH_CAP_NOT_SET", 403);
    const activeHalt = await findActiveCapHalt(transaction, agent.id);

    const [existing] = await transaction
      .select()
      .from(receipts)
      .where(
        and(
          eq(receipts.agentId, agent.id),
          eq(receipts.authorizationNonce, parsed.authorizationNonce),
        ),
      );
    if (existing) {
      if (!matchesRequestSemantics(existing, parsed)) {
        throw new SignGateError("SIGN_REQUEST_CONFLICT", 409);
      }
      if (existing.status === "pending") {
        if (activeHalt) {
          await transaction
            .update(receipts)
            .set({
              intendedNetwork: existing.network,
              reason: "LEASH_CAP_EXCEEDED",
              signedAt: null,
              settlementResponse: null,
              settledAt: null,
              signingClaimedAt: null,
              signingClaimToken: null,
              signingDigest: null,
              signingLeaseExpiresAt: null,
              signingSignature: null,
              status: "blocked",
              txHash: null,
            })
            .where(and(eq(receipts.id, existing.id), eq(receipts.status, "pending")));
          await transaction.insert(agentEvents).values({
            actorSurface: "agent",
            agentId: agent.id,
            metadata: { receiptId: existing.id },
            type: "block",
          });
          return {
            code: "LEASH_CAP_EXCEEDED" as const,
            kind: "blocked" as const,
            receiptId: existing.id,
          };
        }
        return pendingResult(existing.id, parsed, agent.address, true);
      }
      return {
        code:
          existing.status === "blocked"
            ? "LEASH_CAP_EXCEEDED"
            : (existing.reason ?? "SIGN_REQUEST_CONFLICT"),
        kind: existing.status,
        receiptId: existing.id,
      } as const;
    }

    const [knownResource] = await transaction
      .select({ id: receipts.id })
      .from(receipts)
      .where(
        and(
          eq(receipts.agentId, agent.id),
          parsed.resourceIdentityKind === "mcp_resource"
            ? eq(receipts.resourceUrl, parsed.resourceUrl)
            : and(
                eq(receipts.resourceHost, parsed.resourceHost),
                sql`${receipts.resourceUrl} ~ '^https?://'`,
              ),
        ),
      )
      .limit(1);

    const [usage] = await transaction
      .select({
        amountAtomic: sql<string>`coalesce(sum(${receipts.amountAtomic}), 0)::text`,
      })
      .from(receipts)
      .where(
        and(eq(receipts.agentId, agent.id), eq(receipts.cycleId, cycle.id), receiptCommitted()),
      );
    const capAtomicAtAttempt = (BigInt(cap.amountUsdCents) * ATOMIC_UNITS_PER_CENT).toString();
    const committedAtomicBefore = usage?.amountAtomic ?? "0";
    const exceedsCap =
      BigInt(committedAtomicBefore) + BigInt(parsed.amountAtomic) > BigInt(capAtomicAtAttempt);
    const blockedByCap = activeHalt !== undefined || exceedsCap;
    const status = blockedByCap ? "blocked" : "pending";
    const receiptValues: typeof receipts.$inferInsert = {
      agentId: agent.id,
      amountAtomic: parsed.amountAtomic,
      amountUsd: amountUsd(parsed.amountAtomic),
      asset: parsed.asset,
      authorizationNonce: parsed.authorizationNonce,
      authorizationValidBefore: parsed.authorizationValidBefore,
      capAtomicAtAttempt,
      committedAtomicBefore,
      cycleId: cycle.id,
      intendedNetwork: blockedByCap ? parsed.network : null,
      network: parsed.network,
      origin: parsed.origin,
      payTo: parsed.payTo,
      resourceHost: parsed.resourceHost,
      resourceUrl: parsed.resourceUrl,
      reason: blockedByCap ? "LEASH_CAP_EXCEEDED" : null,
      requestFingerprint: parsed.requestFingerprint,
      status,
    };
    const [created] = await transaction
      .insert(receipts)
      .values(receiptValues)
      .returning({ id: receipts.id });
    if (!created) throw new Error("PostgreSQL did not return the receipt reservation");
    await transaction.insert(agentEvents).values({
      actorSurface: "agent",
      agentId: agent.id,
      metadata: { receiptId: created.id },
      type: blockedByCap ? "block" : "sign",
    });
    if (!knownResource) {
      await emitUnusualDomain(transaction, {
        agentId: agent.id,
        cycleId: cycle.id,
        now,
        receiptId: created.id,
        resourceHost: parsed.resourceHost,
        resourceKey: parsed.resourceKey,
        resourceUrl: parsed.resourceUrl,
      });
    }
    if (blockedByCap) {
      await emitCapBlocked(transaction, {
        agentId: agent.id,
        attemptedAtomic: parsed.amountAtomic,
        capAtomic: capAtomicAtAttempt,
        committedAtomic: committedAtomicBefore,
        cycleId: cycle.id,
        now,
        receiptId: created.id,
      });
      return {
        code: "LEASH_CAP_EXCEEDED" as const,
        kind: "blocked" as const,
        receiptId: created.id,
      };
    }
    return pendingResult(created.id, parsed, agent.address, false);
  });
}
