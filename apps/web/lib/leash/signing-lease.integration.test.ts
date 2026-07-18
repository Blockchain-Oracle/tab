import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { agentEvents, receipts } from "../db/schema";
import { reserveSignRequest } from "./sign-store";
import { connection, nowSeconds, provision, signBody } from "./sign-store.integration-support";
import {
  claimSigningLease,
  completeSigningLease,
  MAX_SIGNING_CLAIMS_PER_MINUTE,
} from "./signing-lease";

const DIGEST = `0x${"11".repeat(32)}` as const;
const SIGNATURE = `0x${"22".repeat(65)}` as const;
const FLOAT_BALANCE = BigInt(10_000_000);

function claimContext(seconds = nowSeconds) {
  return {
    floatCheckedAt: new Date(seconds * 1_000),
    liveBalanceAtomic: FLOAT_BALANCE,
  };
}

async function pendingReservation() {
  const identity = await provision();
  const reserved = await reserveSignRequest(connection.db, {
    agentId: identity.agentId,
    body: signBody(),
    keyId: identity.keyId,
    nowSeconds,
  });
  if (reserved.kind !== "pending") throw new Error("Expected a pending reservation");
  return { ...identity, receiptId: reserved.receiptId };
}

describe("PostgreSQL signing claim lease", () => {
  it("allows exactly one concurrent claim and persists one provider attempt", async () => {
    const identity = await pendingReservation();
    const options = {
      agentId: identity.agentId,
      ...claimContext(),
      digest: DIGEST,
      keyId: identity.keyId,
      now: new Date(nowSeconds * 1_000),
      receiptId: identity.receiptId,
    };

    const results = await Promise.all([
      claimSigningLease(connection.db, options),
      claimSigningLease(connection.db, options),
    ]);

    expect(results.map(({ kind }) => kind).sort()).toEqual(["claimed", "in_progress"]);
    const [stored] = await connection.db
      .select({ attempts: receipts.signingAttempts, digest: receipts.signingDigest })
      .from(receipts)
      .where(eq(receipts.id, identity.receiptId));
    expect(stored).toEqual({ attempts: 1, digest: DIGEST });
    const claims = await connection.db
      .select({ id: agentEvents.id })
      .from(agentEvents)
      .where(and(eq(agentEvents.agentId, identity.agentId), eq(agentEvents.type, "sign")));
    expect(claims).toHaveLength(2); // reservation audit + provider signing claim
  });

  it("stores a completed signature and replays it without another claim", async () => {
    const identity = await pendingReservation();
    const claimed = await claimSigningLease(connection.db, {
      agentId: identity.agentId,
      ...claimContext(),
      digest: DIGEST,
      keyId: identity.keyId,
      now: new Date(nowSeconds * 1_000),
      receiptId: identity.receiptId,
    });
    if (claimed.kind !== "claimed") throw new Error("Expected a claim");

    await expect(
      completeSigningLease(connection.db, {
        agentId: identity.agentId,
        claimToken: claimed.claimToken,
        digest: DIGEST,
        keyId: identity.keyId,
        now: new Date((nowSeconds + 1) * 1_000),
        receiptId: identity.receiptId,
        signature: SIGNATURE,
      }),
    ).resolves.toMatchObject({ kind: "signed", signature: SIGNATURE });

    await expect(
      claimSigningLease(connection.db, {
        agentId: identity.agentId,
        ...claimContext(nowSeconds + 2),
        digest: DIGEST,
        keyId: identity.keyId,
        now: new Date((nowSeconds + 2) * 1_000),
        receiptId: identity.receiptId,
      }),
    ).resolves.toMatchObject({ kind: "signed", signature: SIGNATURE });
    const [stored] = await connection.db
      .select({ attempts: receipts.signingAttempts, claim: receipts.signingClaimToken })
      .from(receipts)
      .where(eq(receipts.id, identity.receiptId));
    expect(stored).toEqual({ attempts: 1, claim: null });
  });

  it("requires reconciliation before replacing an expired ambiguous claim", async () => {
    const identity = await pendingReservation();
    const first = await claimSigningLease(connection.db, {
      agentId: identity.agentId,
      ...claimContext(),
      digest: DIGEST,
      keyId: identity.keyId,
      leaseSeconds: 5,
      now: new Date(nowSeconds * 1_000),
      receiptId: identity.receiptId,
    });
    if (first.kind !== "claimed") throw new Error("Expected a claim");

    await expect(
      claimSigningLease(connection.db, {
        agentId: identity.agentId,
        ...claimContext(nowSeconds + 6),
        digest: DIGEST,
        keyId: identity.keyId,
        now: new Date((nowSeconds + 6) * 1_000),
        receiptId: identity.receiptId,
      }),
    ).resolves.toMatchObject({ kind: "reconciliation_required" });

    const reclaimed = await claimSigningLease(connection.db, {
      agentId: identity.agentId,
      allowExpiredReclaim: true,
      ...claimContext(nowSeconds + 6),
      digest: DIGEST,
      keyId: identity.keyId,
      now: new Date((nowSeconds + 6) * 1_000),
      receiptId: identity.receiptId,
    });
    expect(reclaimed).toMatchObject({ kind: "claimed" });
    if (reclaimed.kind !== "claimed") throw new Error("Expected a replacement claim");
    expect(reclaimed.claimToken).not.toBe(first.claimToken);
  });

  it("rate-limits provider claims per agent without terminalizing the receipt", async () => {
    const identity = await pendingReservation();
    await connection.db.insert(agentEvents).values(
      Array.from({ length: MAX_SIGNING_CLAIMS_PER_MINUTE }, () => ({
        actorSurface: "agent" as const,
        agentId: identity.agentId,
        createdAt: new Date((nowSeconds - 1) * 1_000),
        metadata: { signingClaim: true },
        type: "sign" as const,
      })),
    );

    await expect(
      claimSigningLease(connection.db, {
        agentId: identity.agentId,
        ...claimContext(),
        digest: DIGEST,
        keyId: identity.keyId,
        now: new Date(nowSeconds * 1_000),
        receiptId: identity.receiptId,
      }),
    ).resolves.toMatchObject({ kind: "rate_limited" });
    const [stored] = await connection.db
      .select({ status: receipts.status })
      .from(receipts)
      .where(eq(receipts.id, identity.receiptId));
    expect(stored?.status).toBe("pending");
  });
});
