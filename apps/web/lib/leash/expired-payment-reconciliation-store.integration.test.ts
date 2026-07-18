import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { receipts } from "../db/schema";
import { reconcileExpiredPaymentReceipt } from "./expired-payment-reconciliation-store";
import { applySettlementObservation } from "./pay-result-store";
import {
  connection,
  failedObservation,
  observation,
  pendingReceipt,
  transaction,
} from "./pay-result-store.integration-support";
import { receiptCommitted } from "./receipt-commitment";

const DIGEST = `0x${"11".repeat(32)}`;
const SIGNATURE = `0x${"22".repeat(65)}`;

beforeEach(async () => {
  await connection.client`truncate table users cascade`;
});

afterAll(async () => {
  await connection.client.end();
});

async function committedAtomic(agentId: string) {
  const [usage] = await connection.db
    .select({ amount: sql<string>`coalesce(sum(${receipts.amountAtomic}), 0)::text` })
    .from(receipts)
    .where(sql`${receipts.agentId} = ${agentId} and ${receiptCommitted()}`);
  return usage?.amount;
}

describe("expired EIP-3009 receipt reconciliation", () => {
  it("keeps used, not-yet-finalized, and unavailable authorization proofs pending", async () => {
    const pending = await pendingReceipt();
    for (const authorizationUsed of [
      vi.fn(async () => true),
      vi.fn(async () => {
        throw new Error("rpc-query-credential-must-not-escape");
      }),
    ]) {
      await expect(
        reconcileExpiredPaymentReceipt(connection.db, {
          agentId: pending.agentId,
          authorizationUsed,
          receiptId: pending.receiptId,
        }),
      ).resolves.toEqual({
        kind: "pending",
        receiptId: pending.receiptId,
        verified: false,
      });
      const [stored] = await connection.db
        .select({ status: receipts.status })
        .from(receipts)
        .where(eq(receipts.id, pending.receiptId));
      expect(stored?.status).toBe("pending");
    }
  });

  it("terminalizes only a finalized unused authorization and releases its cap commitment", async () => {
    const pending = await pendingReceipt({ amountAtomic: "1000000", capCents: "100" });
    await connection.db
      .update(receipts)
      .set({ signedAt: new Date(), signingDigest: DIGEST, signingSignature: SIGNATURE })
      .where(eq(receipts.id, pending.receiptId));
    const authorizationUsed = vi.fn(async () => false);
    expect(await committedAtomic(pending.agentId)).toBe("1000000");

    await expect(
      reconcileExpiredPaymentReceipt(connection.db, {
        agentId: pending.agentId,
        authorizationUsed,
        receiptId: pending.receiptId,
      }),
    ).resolves.toEqual({
      kind: "failed",
      receiptId: pending.receiptId,
      verified: true,
    });
    await expect(
      reconcileExpiredPaymentReceipt(connection.db, {
        agentId: pending.agentId,
        authorizationUsed,
        receiptId: pending.receiptId,
      }),
    ).resolves.toEqual({
      kind: "failed",
      receiptId: pending.receiptId,
      verified: true,
    });

    const [stored] = await connection.db
      .select({
        intendedNetwork: receipts.intendedNetwork,
        reason: receipts.reason,
        settledAt: receipts.settledAt,
        settlementResponse: receipts.settlementResponse,
        signedAt: receipts.signedAt,
        signingClaimedAt: receipts.signingClaimedAt,
        signingClaimToken: receipts.signingClaimToken,
        signingDigest: receipts.signingDigest,
        signingLeaseExpiresAt: receipts.signingLeaseExpiresAt,
        signingSignature: receipts.signingSignature,
        status: receipts.status,
        txHash: receipts.txHash,
      })
      .from(receipts)
      .where(eq(receipts.id, pending.receiptId));
    expect(stored).toEqual({
      intendedNetwork: null,
      reason: "AUTHORIZATION_EXPIRED",
      settledAt: null,
      settlementResponse: null,
      signedAt: null,
      signingClaimedAt: null,
      signingClaimToken: null,
      signingDigest: null,
      signingLeaseExpiresAt: null,
      signingSignature: null,
      status: "failed",
      txHash: null,
    });
    expect(await committedAtomic(pending.agentId)).toBe("0");
    expect(authorizationUsed).toHaveBeenCalledOnce();
    expect(authorizationUsed).toHaveBeenCalledWith(
      expect.objectContaining({
        network: "eip155:8453",
        payer: "0x2222222222222222222222222222222222222222",
      }),
    );
  });

  it("clears an abandoned signing claim when the authorization is proven unused", async () => {
    const pending = await pendingReceipt();
    const claimedAt = new Date();
    await connection.db
      .update(receipts)
      .set({
        signingClaimedAt: claimedAt,
        signingClaimToken: "33".repeat(32),
        signingDigest: DIGEST,
        signingLeaseExpiresAt: new Date(claimedAt.getTime() + 30_000),
      })
      .where(eq(receipts.id, pending.receiptId));

    await reconcileExpiredPaymentReceipt(connection.db, {
      agentId: pending.agentId,
      authorizationUsed: async () => false,
      receiptId: pending.receiptId,
    });
    const [stored] = await connection.db
      .select({
        claim: receipts.signingClaimToken,
        digest: receipts.signingDigest,
        lease: receipts.signingLeaseExpiresAt,
      })
      .from(receipts)
      .where(eq(receipts.id, pending.receiptId));
    expect(stored).toEqual({ claim: null, digest: null, lease: null });
  });

  it("releases a verified reverted transaction only after finalized expiry proof", async () => {
    const pending = await pendingReceipt({ amountAtomic: "1000000", capCents: "100" });
    await applySettlementObservation(connection.db, {
      agentId: pending.agentId,
      evidence: failedObservation(pending.receiptId),
      verify: async () => true,
    });
    expect(await committedAtomic(pending.agentId)).toBe("1000000");

    const authorizationUsed = vi.fn(async () => false);
    await expect(
      reconcileExpiredPaymentReceipt(connection.db, {
        agentId: pending.agentId,
        authorizationUsed,
        receiptId: pending.receiptId,
      }),
    ).resolves.toEqual({
      kind: "failed",
      receiptId: pending.receiptId,
      verified: true,
    });
    const [stored] = await connection.db
      .select({
        reason: receipts.reason,
        response: receipts.settlementResponse,
        txHash: receipts.txHash,
      })
      .from(receipts)
      .where(eq(receipts.id, pending.receiptId));
    expect(stored).toMatchObject({
      reason: "AUTHORIZATION_EXPIRED",
      response: { proof: "reverted_matching_eip3009_call", transaction },
      txHash: transaction,
    });
    expect(await committedAtomic(pending.agentId)).toBe("0");
    expect(authorizationUsed).toHaveBeenCalledOnce();
  });

  it("scopes ownership, reports missing rows, and conflicts with other terminal outcomes", async () => {
    const pending = await pendingReceipt();
    const authorizationUsed = vi.fn(async () => false);

    await expect(
      reconcileExpiredPaymentReceipt(connection.db, {
        agentId: randomUUID(),
        authorizationUsed,
        receiptId: pending.receiptId,
      }),
    ).resolves.toEqual({ kind: "not_found" });
    await expect(
      reconcileExpiredPaymentReceipt(connection.db, {
        agentId: pending.agentId,
        authorizationUsed,
        receiptId: randomUUID(),
      }),
    ).resolves.toEqual({ kind: "not_found" });
    expect(authorizationUsed).not.toHaveBeenCalled();

    await applySettlementObservation(connection.db, {
      agentId: pending.agentId,
      evidence: observation(pending.receiptId),
      verify: async () => true,
    });
    await expect(
      reconcileExpiredPaymentReceipt(connection.db, {
        agentId: pending.agentId,
        authorizationUsed,
        receiptId: pending.receiptId,
      }),
    ).resolves.toEqual({
      kind: "conflict",
      receiptId: pending.receiptId,
      verified: false,
    });
    expect(authorizationUsed).not.toHaveBeenCalled();
  });
});
