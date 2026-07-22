import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ReceiptItem } from "@/app/(agents)/agents/(control)/receipt-client";
import {
  initialMobileReceiptFeedState,
  loadMobileReceiptResult,
  mobileReceiptFeedReducer,
} from "./receipt-feed-model";
import { MobileReceiptFeedView } from "./receipt-feed-view";

const agentId = "11111111-1111-4111-8111-111111111111";

function receipt(status: ReceiptItem["status"], minute: number, idSuffix: number): ReceiptItem {
  const hasChainEvidence = status === "settled";
  const hash = `0x${String(idSuffix).repeat(64)}`;
  return {
    amountAtomic: `${idSuffix}00000`,
    amountDisplay: `$0.${idSuffix}0`,
    amountUsd: `0.${idSuffix}00000`,
    asset: "USDC",
    authorizationNonce: "0xab",
    authorizationValidBefore: "2026-07-16T11:00:00.000Z",
    capContext: null,
    createdAt: `2026-07-18T10:${String(minute).padStart(2, "0")}:00.000Z`,
    explorer: hasChainEvidence
      ? { href: `https://sepolia.basescan.org/tx/${hash}`, label: "View on Basescan" }
      : null,
    id: `22222222-2222-4222-8222-22222222222${idSuffix}`,
    network: {
      id: "eip155:84532",
      label: "Base Sepolia",
      target: false,
      testFunds: true,
      testFundsLabel: "Testnet",
    },
    origin: null,
    payTo: "0x1111111111111111111111111111111111111111",
    reason: status === "blocked" ? "CAP_EXCEEDED" : null,
    resourceHost: `resource-${idSuffix}.example.test`,
    resourceUrl: `https://resource-${idSuffix}.example.test/x402`,
    settledAt: hasChainEvidence ? "2026-07-18T10:10:00.000Z" : null,
    status,
    txHash: hasChainEvidence ? hash : null,
  };
}

describe("mobile receipt feed model", () => {
  it("uses the owner-scoped same-origin API with no-store and sorts newest first", async () => {
    const signal = new AbortController().signal;
    const older = receipt("settled", 1, 1);
    const newer = receipt("pending", 9, 2);
    const request = vi.fn(async () =>
      Response.json({ nextCursor: null, receipts: [older, newer] }),
    );

    const result = await loadMobileReceiptResult({ agentId, request, signal });

    expect(request).toHaveBeenCalledWith(`/api/agents/receipts?agentId=${agentId}&limit=100`, {
      cache: "no-store",
      signal,
    });
    expect(result.receipts.map(({ id }) => id)).toEqual([newer.id, older.id]);
  });

  it("notifies the injected auth-expired callback on 401 without trusting its body", async () => {
    const onAuthExpired = vi.fn();
    const request = vi.fn(async () =>
      Response.json({ error: { message: "provider detail must stay private" } }, { status: 401 }),
    );

    await expect(loadMobileReceiptResult({ agentId, onAuthExpired, request })).rejects.toThrow(
      "Your Agent session expired.",
    );
    expect(onAuthExpired).toHaveBeenCalledOnce();
  });

  it("keeps the last real snapshot while a refresh is retrying", () => {
    const original = { nextCursor: null, receipts: [receipt("settled", 2, 1)] };
    const live = mobileReceiptFeedReducer(initialMobileReceiptFeedState(original), {
      receivedAt: 10,
      result: original,
      type: "poll_succeeded",
    });
    const retrying = mobileReceiptFeedReducer(live, {
      message: "Payment receipts could not be refreshed.",
      type: "poll_failed",
    });

    expect(retrying.connection).toBe("retrying");
    expect(retrying.result).toEqual(live.result);
  });
});

describe("mobile receipt feed view", () => {
  it("renders real rows newest-first with every canonical status and mobile deep links", () => {
    const receipts = [
      receipt("settled", 1, 1),
      receipt("blocked", 4, 4),
      receipt("failed", 3, 3),
      receipt("pending", 2, 2),
    ];
    const state = mobileReceiptFeedReducer(
      initialMobileReceiptFeedState({
        nextCursor: null,
        receipts,
      }),
      {
        receivedAt: Date.parse("2026-07-18T10:05:00.000Z"),
        result: { nextCursor: null, receipts },
        type: "poll_succeeded",
      },
    );

    const html = renderToStaticMarkup(<MobileReceiptFeedView agentId={agentId} state={state} />);

    expect(html).toContain("Live");
    expect(html).toContain("Blocked");
    expect(html).toContain("Failed");
    expect(html).toContain("Pending");
    expect(html).toContain("Settled");
    expect(html).toContain("Testnet");
    expect(html).toContain(`/mobile/receipts/${receipts[1]?.id}?agentId=${agentId}`);
    expect(html.indexOf("resource-4.example.test")).toBeLessThan(
      html.indexOf("resource-1.example.test"),
    );
  });

  it("does not make a live claim while loading", () => {
    const html = renderToStaticMarkup(
      <MobileReceiptFeedView agentId={agentId} state={initialMobileReceiptFeedState(null)} />,
    );

    expect(html).toContain("Loading payment receipts");
    expect(html).not.toContain(">Live<");
  });

  it("renders an honest empty ledger after a successful load", () => {
    const state = mobileReceiptFeedReducer(initialMobileReceiptFeedState(null), {
      receivedAt: 10,
      result: { nextCursor: null, receipts: [] },
      type: "poll_succeeded",
    });
    const html = renderToStaticMarkup(<MobileReceiptFeedView agentId={agentId} state={state} />);

    expect(html).toContain("No payments yet");
    expect(html).toContain("no x402 receipts yet");
  });

  it("labels delayed updates and retains the last loaded receipt", () => {
    const result = { nextCursor: null, receipts: [receipt("settled", 1, 1)] };
    const live = mobileReceiptFeedReducer(initialMobileReceiptFeedState(result), {
      receivedAt: 10,
      result,
      type: "poll_succeeded",
    });
    const state = mobileReceiptFeedReducer(live, {
      message: "Payment receipts could not be refreshed.",
      type: "poll_failed",
    });
    const html = renderToStaticMarkup(
      <MobileReceiptFeedView agentId={agentId} onRetry={() => undefined} state={state} />,
    );

    expect(html).toContain("Retrying");
    expect(html).toContain("Showing the last loaded receipts");
    expect(html).toContain("Retry now");
    expect(html).toContain("resource-1.example.test");
  });
});
