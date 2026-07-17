import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "../db/client";
import { notifications } from "../db/schema";
import { applySettlementObservation, SettlementResultConflictError } from "./pay-result-store";
import {
  connection,
  failedObservation,
  observation,
  pendingReceipt,
  transaction,
} from "./pay-result-store.integration-support";

beforeEach(async () => {
  await connection.client`truncate table users cascade`;
});

afterAll(async () => {
  await connection.client.end();
});

describe("on-chain verified receipt finalization", () => {
  it("keeps forged but shaped resource evidence pending", async () => {
    const pending = await pendingReceipt();
    const verify = vi.fn(async () => false);

    await expect(
      applySettlementObservation(connection.db, {
        agentId: pending.agentId,
        evidence: observation(pending.receiptId),
        verify,
      }),
    ).resolves.toEqual({ kind: "pending", receiptId: pending.receiptId, verified: false });
    const [stored] = await connection.client<{ status: string; tx_hash: string | null }[]>`
      select status, tx_hash from receipts where id = ${pending.receiptId}
    `;
    expect(stored).toEqual({ status: "pending", tx_hash: null });
    expect(verify).toHaveBeenCalledOnce();
  });

  it("settles only after proof and makes identical callbacks idempotent", async () => {
    const pending = await pendingReceipt();
    const verify = vi.fn(async () => true);
    const evidence = observation(pending.receiptId);

    await expect(
      applySettlementObservation(connection.db, { agentId: pending.agentId, evidence, verify }),
    ).resolves.toEqual({ kind: "settled", receiptId: pending.receiptId, verified: true });
    await expect(
      applySettlementObservation(connection.db, { agentId: pending.agentId, evidence, verify }),
    ).resolves.toEqual({ kind: "settled", receiptId: pending.receiptId, verified: true });

    const [stored] = await connection.client<
      {
        settlement_response: Record<string, unknown>;
        status: string;
        tx_hash: string;
      }[]
    >`select status, tx_hash, settlement_response from receipts where id = ${pending.receiptId}`;
    expect(stored).toMatchObject({
      settlement_response: { proof: "usdc_transfer_and_authorization_used" },
      status: "settled",
      tx_hash: transaction,
    });
    expect(verify).toHaveBeenCalledOnce();
    expect(await connection.db.select().from(notifications)).toEqual([]);
  });

  it("records a verified reverted transaction as failed evidence and makes it idempotent", async () => {
    const pending = await pendingReceipt();
    const verify = vi.fn(async () => true);
    const evidence = failedObservation(pending.receiptId);

    await expect(
      applySettlementObservation(connection.db, { agentId: pending.agentId, evidence, verify }),
    ).resolves.toEqual({ kind: "failed", receiptId: pending.receiptId, verified: true });
    await expect(
      applySettlementObservation(connection.db, { agentId: pending.agentId, evidence, verify }),
    ).resolves.toEqual({ kind: "failed", receiptId: pending.receiptId, verified: true });

    const [stored] = await connection.client<
      {
        reason: string;
        settlement_response: Record<string, unknown>;
        settled_at: Date | null;
        status: string;
        tx_hash: string;
      }[]
    >`
      select status, reason, tx_hash, settlement_response, settled_at
      from receipts where id = ${pending.receiptId}
    `;
    expect(stored).toMatchObject({
      reason: "invalid_exact_evm_transaction_failed",
      settlement_response: {
        proof: "reverted_matching_eip3009_call",
        success: false,
      },
      settled_at: null,
      status: "failed",
      tx_hash: transaction,
    });
    expect(verify).toHaveBeenCalledOnce();
    expect(await connection.db.select().from(notifications)).toEqual([]);
  });

  it("reconciles a later verified success instead of hiding it behind failed evidence", async () => {
    const pending = await pendingReceipt();
    const verify = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const failed = failedObservation(pending.receiptId);
    const successfulHash = `0x${"cd".repeat(32)}` as const;
    const success = observation(pending.receiptId, successfulHash);

    await applySettlementObservation(connection.db, {
      agentId: pending.agentId,
      evidence: failed,
      verify,
    });
    await expect(
      applySettlementObservation(connection.db, {
        agentId: pending.agentId,
        evidence: success,
        verify,
      }),
    ).resolves.toEqual({ kind: "pending", receiptId: pending.receiptId, verified: false });
    await expect(
      applySettlementObservation(connection.db, {
        agentId: pending.agentId,
        evidence: success,
        verify,
      }),
    ).resolves.toEqual({ kind: "settled", receiptId: pending.receiptId, verified: true });
    await expect(
      applySettlementObservation(connection.db, {
        agentId: pending.agentId,
        evidence: success,
        verify,
      }),
    ).resolves.toEqual({ kind: "settled", receiptId: pending.receiptId, verified: true });

    const [stored] = await connection.client<
      {
        reason: string | null;
        settlement_response: Record<string, unknown>;
        status: string;
        tx_hash: string;
      }[]
    >`
      select status, reason, tx_hash, settlement_response
      from receipts where id = ${pending.receiptId}
    `;
    expect(stored).toMatchObject({
      reason: null,
      settlement_response: {
        priorRevertedTransaction: transaction,
        proof: "usdc_transfer_and_authorization_used",
        success: true,
      },
      status: "settled",
      tx_hash: successfulHash,
    });
    expect(verify).toHaveBeenCalledTimes(3);
  });

  it("emits cap_75 once per cycle after concurrent verified finalization", async () => {
    const pending = await pendingReceipt({ amountAtomic: "750000" });
    const evidence = observation(pending.receiptId);

    const results = await Promise.all([
      applySettlementObservation(connection.db, {
        agentId: pending.agentId,
        evidence,
        verify: async () => true,
      }),
      applySettlementObservation(connection.db, {
        agentId: pending.agentId,
        evidence,
        verify: async () => true,
      }),
    ]);

    expect(results).toEqual([
      { kind: "settled", receiptId: pending.receiptId, verified: true },
      { kind: "settled", receiptId: pending.receiptId, verified: true },
    ]);
    const rows = await connection.db.select().from(notifications);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      cycleId: pending.cycleId,
      eventKey: `cap_75:${pending.cycleId}`,
      metadata: {
        capAtomic: "1000000",
        committedAtomic: "750000",
        thresholdPercent: 75,
      },
      sticky: false,
      tier: "2",
      type: "cap_75",
    });
  });

  it("rolls verified settlement and its threshold notification back together", async () => {
    const pending = await pendingReceipt({ amountAtomic: "750000" });

    await expect(
      connection.db.transaction(async (transaction) => {
        const result = await applySettlementObservation(transaction as unknown as Database, {
          agentId: pending.agentId,
          evidence: observation(pending.receiptId),
          verify: async () => true,
        });
        expect(result.kind).toBe("settled");
        expect(await transaction.select().from(notifications)).toHaveLength(1);
        throw new Error("rollback settlement");
      }),
    ).rejects.toThrow("rollback settlement");

    const [stored] = await connection.client<{ status: string }[]>`
      select status from receipts where id = ${pending.receiptId}
    `;
    expect(stored?.status).toBe("pending");
    expect(await connection.db.select().from(notifications)).toEqual([]);
  });

  it("scopes observations to the authenticated agent and rejects conflicting final evidence", async () => {
    const pending = await pendingReceipt();
    await expect(
      applySettlementObservation(connection.db, {
        agentId: randomUUID(),
        evidence: observation(pending.receiptId),
        verify: async () => true,
      }),
    ).resolves.toEqual({ kind: "not_found" });

    const evidence = observation(pending.receiptId);
    await applySettlementObservation(connection.db, {
      agentId: pending.agentId,
      evidence,
      verify: async () => true,
    });
    await expect(
      applySettlementObservation(connection.db, {
        agentId: pending.agentId,
        evidence: observation(pending.receiptId, `0x${"cd".repeat(32)}`),
        verify: async () => true,
      }),
    ).rejects.toBeInstanceOf(SettlementResultConflictError);
  });
});
