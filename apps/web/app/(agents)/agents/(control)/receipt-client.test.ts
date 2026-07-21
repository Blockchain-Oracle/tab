import { describe, expect, it, vi } from "vitest";

import {
  initialReceiptFeedState,
  loadCapPolicy,
  loadCapSnapshot,
  loadReceiptDetail,
  loadReceiptResult,
  RECEIPT_FEED_STALE_AFTER_MS,
  RECEIPT_POLL_INTERVAL_MS,
  RECEIPT_REQUEST_TIMEOUT_MS,
  type ReceiptItem,
  receiptFeedReducer,
} from "./receipt-client";

const agentId = "11111111-1111-4111-8111-111111111111";
const receiptId = "22222222-2222-4222-8222-222222222222";
const resetAt = "2026-07-17T10:00:00.000Z";

function receipt(createdAt: string, id = receiptId): ReceiptItem {
  return {
    amountAtomic: "420000",
    amountDisplay: "$0.42",
    amountUsd: "0.420000",
    asset: "USDC",
    capContext: null,
    createdAt,
    explorer: null,
    id,
    network: { id: "eip155:8453", label: "Base", target: false },
    origin: null,
    payTo: "0x1111111111111111111111111111111111111111",
    reason: null,
    resourceHost: "api.example.test",
    resourceUrl: "https://api.example.test/search",
    settledAt: null,
    status: "pending",
    txHash: null,
  };
}

function response(body: unknown, ok = true) {
  return { json: vi.fn().mockResolvedValue(body), ok };
}

describe("receipt client", () => {
  it("uses the accepted three-second live polling cadence", () => {
    expect(RECEIPT_POLL_INTERVAL_MS).toBe(3_000);
    expect(RECEIPT_FEED_STALE_AFTER_MS).toBe(RECEIPT_POLL_INTERVAL_MS * 3);
    expect(RECEIPT_REQUEST_TIMEOUT_MS).toBe(RECEIPT_POLL_INTERVAL_MS * 4);
  });

  it("loads the latest real receipt page without browser caching", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        response({ nextCursor: null, receipts: [receipt("2026-07-17T10:00:00.000Z")] }),
      );

    const result = await loadReceiptResult({ agentId, request });

    expect(result.receipts).toHaveLength(1);
    expect(request).toHaveBeenCalledWith(
      `/api/leash/receipts?agentId=${agentId}&limit=100`,
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("loads one receipt through its owner-scoped API", async () => {
    const item = receipt("2026-07-17T10:00:00.000Z");
    const request = vi.fn().mockResolvedValue(response({ receipt: item }));

    await expect(loadReceiptDetail({ receiptId, request })).resolves.toEqual(item);
    expect(request).toHaveBeenCalledWith(
      `/api/leash/receipts/${receiptId}`,
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("loads the owner-scoped cap projection without browser caching", async () => {
    const request = vi.fn().mockResolvedValue(response({ policy: null }));
    await expect(loadCapPolicy({ agentId, request })).resolves.toBeNull();
    expect(request).toHaveBeenCalledWith(
      `/api/leash/caps?agentId=${agentId}`,
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("loads the live cap reset transition with the policy snapshot", async () => {
    const resetNotice = { reason: "manual" as const, resetAt };
    const request = vi.fn().mockResolvedValue(response({ policy: null, resetNotice }));
    await expect(loadCapSnapshot({ agentId, request })).resolves.toEqual({
      policy: null,
      resetNotice,
    });
  });

  it("uses the API error and leaves the prior feed snapshot intact", async () => {
    const prior = initialReceiptFeedState({
      nextCursor: null,
      receipts: [receipt("2026-07-17T10:00:00.000Z")],
    });
    const request = vi
      .fn()
      .mockResolvedValue(response({ error: { message: "Receipt service unavailable." } }, false));

    await expect(loadReceiptResult({ agentId, request })).rejects.toThrow(
      "Receipt service unavailable.",
    );
    const failed = receiptFeedReducer(prior, {
      message: "Receipt service unavailable.",
      type: "poll_failed",
    });

    expect(failed.result).toBe(prior.result);
    expect(failed.connection).toBe("retrying");
  });

  it("only becomes live after a successful poll and enforces strict reverse order", () => {
    const initial = initialReceiptFeedState({ nextCursor: null, receipts: [] });
    const older = receipt("2026-07-17T09:00:00.000Z", receiptId);
    const newer = receipt("2026-07-17T10:00:00.000Z", "33333333-3333-4333-8333-333333333333");

    expect(initial.connection).toBe("connecting");
    const live = receiptFeedReducer(initial, {
      receivedAt: 1_721_210_400_000,
      result: { nextCursor: null, receipts: [older, newer] },
      type: "poll_succeeded",
    });

    expect(live.connection).toBe("live");
    expect(live.lastSuccessfulPollAt).toBe(1_721_210_400_000);
    expect(live.result.receipts.map((item) => item.id)).toEqual([newer.id, older.id]);
  });

  it("downgrades an expired live result without discarding its rows", () => {
    const result = { nextCursor: null, receipts: [receipt("2026-07-17T10:00:00.000Z")] };
    const live = receiptFeedReducer(initialReceiptFeedState(result), {
      receivedAt: 10_000,
      result,
      type: "poll_succeeded",
    });

    const stale = receiptFeedReducer(live, {
      checkedAt: 10_000 + RECEIPT_FEED_STALE_AFTER_MS,
      type: "health_checked",
    });

    expect(stale.connection).toBe("retrying");
    expect(stale.error).toContain("last successful receipt snapshot");
    expect(stale.result).toBe(live.result);
  });
});
