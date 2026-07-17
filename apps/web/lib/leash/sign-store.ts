import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import type { Database } from "../db/client";
import { agentEvents, agents, capCycles, caps, leashKeys, receipts } from "../db/schema";
import { SignGateError, statusGateError } from "./sign-gate";
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
  return db.transaction(async (transaction) => {
    const [agent] = await transaction
      .select({ address: agents.agentAddress, id: agents.id, status: agents.status })
      .from(agents)
      .where(eq(agents.id, options.agentId))
      .for("update");
    if (!agent) throw new SignGateError("INVALID_LEASH_KEY", 401);

    const blockedStatus = statusGateError(agent.status);
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
      ...(options.nowSeconds === undefined ? {} : { nowSeconds: options.nowSeconds }),
    });
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

    const [policy] = await transaction
      .select({ amountUsdCents: caps.amountUsdCents, cycleId: capCycles.id })
      .from(caps)
      .innerJoin(capCycles, and(eq(capCycles.agentId, caps.agentId), isNull(capCycles.endedAt)))
      .where(eq(caps.agentId, agent.id));
    if (!policy?.amountUsdCents) throw new SignGateError("LEASH_CAP_NOT_SET", 403);

    const [usage] = await transaction
      .select({
        amountAtomic: sql<string>`coalesce(sum(${receipts.amountAtomic}), 0)::text`,
      })
      .from(receipts)
      .where(
        and(
          eq(receipts.agentId, agent.id),
          eq(receipts.cycleId, policy.cycleId),
          inArray(receipts.status, ["pending", "settled"]),
        ),
      );
    const exceedsCap =
      BigInt(usage?.amountAtomic ?? "0") + BigInt(parsed.amountAtomic) >
      BigInt(policy.amountUsdCents) * ATOMIC_UNITS_PER_CENT;
    const status = exceedsCap ? "blocked" : "pending";
    const receiptValues: typeof receipts.$inferInsert = {
      agentId: agent.id,
      amountAtomic: parsed.amountAtomic,
      amountUsd: amountUsd(parsed.amountAtomic),
      asset: parsed.asset,
      authorizationNonce: parsed.authorizationNonce,
      authorizationValidBefore: parsed.authorizationValidBefore,
      cycleId: policy.cycleId,
      intendedNetwork: exceedsCap ? parsed.network : null,
      network: parsed.network,
      origin: parsed.origin,
      payTo: parsed.payTo,
      reason: exceedsCap ? "LEASH_CAP_EXCEEDED" : null,
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
      type: exceedsCap ? "block" : "sign",
    });
    if (exceedsCap) {
      return {
        code: "LEASH_CAP_EXCEEDED" as const,
        kind: "blocked" as const,
        receiptId: created.id,
      };
    }
    return pendingResult(created.id, parsed, agent.address, false);
  });
}
