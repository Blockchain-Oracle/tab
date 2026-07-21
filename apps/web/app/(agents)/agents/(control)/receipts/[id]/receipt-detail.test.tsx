import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ReceiptItem } from "../../receipt-client";
import { ReceiptDetailView } from "./receipt-detail";

const transactionHash = `0x${"a".repeat(64)}`;

function receipt(status: ReceiptItem["status"]): ReceiptItem {
  const settled = status === "settled";
  const blocked = status === "blocked";
  return {
    amountAtomic: "420000",
    amountDisplay: "$0.42",
    amountUsd: "0.420000",
    asset: "USDC",
    capContext: {
      capAtomic: "1000000",
      committedBeforeAtomic: blocked ? "680000" : "500000",
      projectedAfterAtomic: blocked ? "1100000" : "920000",
    },
    createdAt: "2026-07-17T10:00:00.123Z",
    explorer: settled
      ? { href: `https://basescan.org/tx/${transactionHash}`, label: "View on Basescan" }
      : null,
    id: "22222222-2222-4222-8222-222222222222",
    network: { id: "eip155:8453", label: "Base", target: status === "blocked" },
    origin: { clientName: "Claude Code", toolName: "search", transport: "mcp" },
    payTo: "0x1111111111111111111111111111111111111111",
    reason: status === "blocked" ? "LEASH_CAP_EXCEEDED" : null,
    resourceHost: "api.example.test",
    resourceUrl: "https://api.example.test/search",
    settledAt: settled ? "2026-07-17T10:00:01.000Z" : null,
    status,
    txHash: settled ? transactionHash : null,
  };
}

describe("receipt detail", () => {
  it("shows real origin and settled transaction evidence", () => {
    const html = renderToStaticMarkup(
      <ReceiptDetailView
        backAgentId="11111111-1111-4111-8111-111111111111"
        error={null}
        loading={false}
        receipt={receipt("settled")}
      />,
    );

    expect(html).toContain("ORIGIN");
    expect(html).toContain("Claude Code");
    expect(html).toContain("search");
    expect(html).toContain("View on Basescan");
    expect(html).toContain("Raw amount");
    expect(html).toContain("420000 atomic units");
    expect(html).toContain("eip155:8453");
    expect(html).toContain("Cumulative committed spend after this payment is $0.92 of $1.00.");
    expect(html).toContain(transactionHash);
    expect(html).toContain('aria-label="Copy resource URL"');
    expect(html).toContain('aria-label="Copy pay-to address"');
    expect(html).toContain('aria-label="Copy transaction hash"');
  });

  it.each([
    "pending",
    "blocked",
  ] as const)("never renders an explorer for a %s receipt", (status) => {
    const unsafe = {
      ...receipt(status),
      explorer: { href: "https://example.test/fake", label: "Fake explorer" },
    };
    const html = renderToStaticMarkup(
      <ReceiptDetailView backAgentId={null} error={null} loading={false} receipt={unsafe} />,
    );

    expect(html).not.toContain("Fake explorer");
    expect(html).not.toContain("example.test/fake");
  });

  it("renders the real explorer evidence for a failed on-chain transaction", () => {
    const failed = {
      ...receipt("failed"),
      explorer: { href: `https://basescan.org/tx/${transactionHash}`, label: "View on Basescan" },
      reason: "invalid_exact_evm_transaction_failed",
      txHash: transactionHash,
    };
    const html = renderToStaticMarkup(
      <ReceiptDetailView backAgentId={null} error={null} loading={false} receipt={failed} />,
    );

    expect(html).toContain("Failed");
    expect(html).toContain("invalid_exact_evm_transaction_failed");
    expect(html).toContain(transactionHash);
    expect(html).toContain("View on Basescan");
    expect(html).toContain(
      "This matching reverted EIP-3009 call remains committed for its entire cap cycle.",
    );
    expect(html).not.toContain("Settled</b>");
  });

  it("renders an honest origin-unavailable state", () => {
    const html = renderToStaticMarkup(
      <ReceiptDetailView
        backAgentId={null}
        error={null}
        loading={false}
        receipt={{ ...receipt("pending"), origin: null }}
      />,
    );

    expect(html).toContain("Origin metadata is unavailable for this receipt.");
  });

  it("explains pending cap commitment from the immutable attempt snapshot", () => {
    const html = renderToStaticMarkup(
      <ReceiptDetailView
        backAgentId={null}
        error={null}
        loading={false}
        receipt={receipt("pending")}
      />,
    );

    expect(html).toContain(
      "Cumulative committed spend including this pending payment is $0.92 of $1.00.",
    );
  });

  it("explains blocked math without counting or claiming a transfer", () => {
    const html = renderToStaticMarkup(
      <ReceiptDetailView
        backAgentId={null}
        error={null}
        loading={false}
        receipt={receipt("blocked")}
      />,
    );

    expect(html).toContain(
      "This attempt would have pushed cumulative committed spend to $1.10 of $1.00.",
    );
    expect(html).toContain("Nothing was sent, and blocked attempts do not count toward the cap.");
  });

  it("explains failed math while preserving the real failure reason", () => {
    const failed = { ...receipt("failed"), reason: "FLOAT_EMPTY" };
    const html = renderToStaticMarkup(
      <ReceiptDetailView backAgentId={null} error={null} loading={false} receipt={failed} />,
    );

    expect(html).toContain("FLOAT_EMPTY");
    expect(html).toContain("Cumulative committed spend remained $0.50 of $1.00.");
    expect(html).toContain("This failed attempt does not count toward the cap.");
  });

  it("does not substitute current cap data for a legacy receipt", () => {
    const html = renderToStaticMarkup(
      <ReceiptDetailView
        backAgentId={null}
        error={null}
        loading={false}
        receipt={{ ...receipt("settled"), capContext: null }}
      />,
    );

    expect(html).toContain("Receipt-time cap context is unavailable for this legacy receipt.");
    expect(html).toContain("Current cap data is not substituted.");
  });
});
