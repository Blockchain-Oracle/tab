import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CapPolicyView } from "../../../../../lib/leash/cap-view";
import type { ReceiptFeedState, ReceiptItem } from "../receipt-client";
import { ReceiptFeedView } from "./receipt-feed";

const resetAt = "2026-07-17T10:00:00.000Z";

function capPolicy(halted = false): CapPolicyView {
  return {
    agentId: "agent",
    cap: { amountUsdCents: "1000", frequency: "daily", updatedAt: resetAt },
    cycle: { id: "cycle", nextResetAt: null, startedAt: resetAt },
    halted,
    spend: {
      approaching: true,
      atOrAboveLimit: halted,
      blockedReceiptCount: halted ? 2 : 0,
      capAtomic: "10000000",
      capFillBasisPoints: halted ? "10000" : "7600",
      committedAtomic: halted ? "10000000" : "7600000",
      committedBasisPoints: halted ? "10000" : "7600",
      overageAtomic: "0",
      overageFillBasisPoints: "0",
      pendingAtomic: "0",
      pendingFillBasisPoints: "0",
      reservedAtomic: "0",
      reservedFillBasisPoints: "0",
      revertedAtomic: "0",
      settledAtomic: halted ? "10000000" : "7600000",
      settledFillBasisPoints: halted ? "10000" : "7600",
    },
  };
}

function receipt(status: ReceiptItem["status"], index: number): ReceiptItem {
  const settled = status === "settled";
  return {
    amountAtomic: `${index}00000`,
    amountDisplay: `$0.${index}0`,
    amountUsd: `0.${index}00000`,
    asset: "USDC",
    capContext: null,
    createdAt: `2026-07-17T10:0${index}:00.000Z`,
    explorer: settled
      ? { href: `https://basescan.org/tx/0x${"a".repeat(64)}`, label: "View on Basescan" }
      : null,
    id: `00000000-0000-4000-8000-00000000000${index}`,
    network: {
      id: status === "blocked" ? "eip155:42161" : "eip155:8453",
      label: status === "blocked" ? "Arbitrum" : "Base",
      target: status === "blocked",
    },
    origin: null,
    payTo: "0x1111111111111111111111111111111111111111",
    reason: status === "blocked" ? "LEASH_CAP_EXCEEDED" : null,
    resourceHost: `api-${index}.example.test`,
    resourceUrl: `https://api-${index}.example.test/search`,
    settledAt: settled ? "2026-07-17T10:10:00.000Z" : null,
    status,
    txHash: settled ? `0x${"a".repeat(64)}` : null,
  };
}

function state(overrides: Partial<ReceiptFeedState> = {}): ReceiptFeedState {
  return {
    connection: "live",
    error: null,
    lastSuccessfulPollAt: Date.parse(resetAt),
    result: {
      nextCursor: null,
      receipts: [
        receipt("settled", 4),
        receipt("pending", 3),
        receipt("failed", 2),
        receipt("blocked", 1),
      ],
    },
    ...overrides,
  };
}

describe("receipt feed", () => {
  it("renders all canonical statuses and labels a blocked destination as a target", () => {
    const html = renderToStaticMarkup(
      <ReceiptFeedView agentId="agent" capResetNotice={null} state={state()} />,
    );

    expect(html).toContain("Settled");
    expect(html).toContain("Pending");
    expect(html).toContain("Failed");
    expect(html).toContain("Blocked");
    expect(html).toContain("Arbitrum (target)");
    expect(html).toContain("AMOUNT");
    expect(html).toContain("RESOURCE");
    expect(html).toContain("STATUS");
    expect(html).toContain("NETWORK");
    expect(html).toContain("TX HASH");
    expect(html).toContain("TIME");
    expect(html).toContain("https://api-4.example.test/search");
    expect(html).toContain("https://basescan.org/tx/");
    expect(html).toContain(`0x${"a".repeat(64)}`);
    expect(html).toContain("/leash/receipts/00000000-0000-4000-8000-000000000004");
  });

  it("shows explorer evidence for a failed transaction that reached chain", () => {
    const failed = {
      ...receipt("failed", 2),
      explorer: {
        href: `https://basescan.org/tx/0x${"b".repeat(64)}`,
        label: "View on Basescan",
      },
      reason: "invalid_exact_evm_transaction_failed",
      txHash: `0x${"b".repeat(64)}`,
    };
    const html = renderToStaticMarkup(
      <ReceiptFeedView
        agentId="agent"
        capResetNotice={null}
        state={state({ result: { nextCursor: null, receipts: [failed] } })}
      />,
    );

    expect(html).toContain("Failed");
    expect(html).toContain("View on Basescan");
    expect(html).toContain("0xbbbbbbbb");
  });

  it("never renders an explorer affordance for an unsettled row", () => {
    const unsafePending = {
      ...receipt("pending", 3),
      explorer: { href: "https://example.test/fake", label: "Fake explorer" },
      txHash: `0x${"b".repeat(64)}`,
    };
    const html = renderToStaticMarkup(
      <ReceiptFeedView
        agentId="agent"
        capResetNotice={null}
        state={state({ result: { nextCursor: null, receipts: [unsafePending] } })}
      />,
    );

    expect(html).not.toContain("example.test/fake");
    expect(html).not.toContain(`0x${"b".repeat(64)}`);
  });

  it("does not claim the feed is live before a successful poll", () => {
    const html = renderToStaticMarkup(
      <ReceiptFeedView
        agentId="agent"
        capResetNotice={null}
        state={state({
          connection: "connecting",
          lastSuccessfulPollAt: null,
          result: { nextCursor: null, receipts: [] },
        })}
      />,
    );

    expect(html).toContain("Connecting");
    expect(html).not.toContain(">Live<");
    expect(html).toContain("Loading payment receipts");
  });

  it("keeps rendering prior rows while a poll error is announced", () => {
    const html = renderToStaticMarkup(
      <ReceiptFeedView
        agentId="agent"
        capResetNotice={null}
        onRetry={() => undefined}
        state={state({ connection: "retrying", error: "Receipt service unavailable." })}
      />,
    );

    expect(html).toContain("Updates paused");
    expect(html).toContain("Receipt service unavailable.");
    expect(html).toContain("Retry now");
    expect(html).toContain("api-4.example.test");
  });

  it.each([
    ["schedule", "Reset on schedule"],
    ["manual", "Reset manually"],
    ["frequency_change", "Reset after a frequency change"],
  ] as const)("renders a truthful %s current-cycle transition", (reason, copy) => {
    const html = renderToStaticMarkup(
      <ReceiptFeedView agentId="agent" capResetNotice={{ reason, resetAt }} state={state()} />,
    );

    expect(html).toContain("CYCLE RESET");
    expect(html).toContain(copy);
    expect(html).toContain(`dateTime="${resetAt}"`);
    expect(html).toContain("This cycle’s spend counts from that boundary.");
    expect(html).not.toContain("resumed automatically");
  });

  it("does not render a reset banner without a real transition", () => {
    const html = renderToStaticMarkup(
      <ReceiptFeedView agentId="agent" capResetNotice={null} state={state()} />,
    );

    expect(html).not.toContain("CYCLE RESET");
  });

  it("renders the real near-limit cap projection and remediation", () => {
    const html = renderToStaticMarkup(
      <ReceiptFeedView
        agentId="agent"
        capResetNotice={null}
        policy={capPolicy()}
        state={state()}
      />,
    );
    expect(html).toContain("$7.60");
    expect(html).toContain("76%");
    expect(html).toContain("ALERT · CAP NEAR LIMIT");
    expect(html).toContain("Adjust cap");
  });

  it("renders at-limit truth that blocked attempts were not sent", () => {
    const html = renderToStaticMarkup(
      <ReceiptFeedView
        agentId="agent"
        capResetNotice={null}
        policy={capPolicy(true)}
        state={state()}
      />,
    );
    expect(html).toContain("ACTION REQUIRED · PAYMENTS HALTED");
    expect(html).toContain("none were sent");
    expect(html).toContain("2 cap-blocked attempts this cycle");
    expect(html).toContain("Raise cap");
  });
});
