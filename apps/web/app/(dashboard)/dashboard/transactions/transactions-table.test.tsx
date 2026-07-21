import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { DashboardTransaction } from "../../../../lib/payments/dashboard-transactions";
import { TransactionDetail } from "./transaction-detail";
import { TransactionsEmptyState } from "./transactions-empty-state";
import { TransactionsFilters } from "./transactions-filters";
import { TransactionsTable } from "./transactions-table";

const createdAt = new Date("2026-07-15T12:00:00Z");

function transaction(
  overrides: Partial<DashboardTransaction> = {},
): DashboardTransaction & { payerEmail: string } {
  return {
    amountUsd: "7.250000",
    createdAt,
    currency: "USD",
    env: "test",
    failureReason: null,
    intentUrl: "https://merchant.example.test/api/tab/intent",
    payerAddress: "0x2222222222222222222222222222222222222222",
    payerEmail: "private-payer@example.test",
    payerType: "human",
    paymentId: "payment-test",
    receiver: "0x1111111111111111111111111111111111111111",
    refCode: "TAB-TEST",
    reportedAt: createdAt,
    reportedTokenChanges: [{ source: "buyer-report" }],
    reportedTransactionId: "test_transaction",
    settledAt: createdAt,
    settlement: {
      amountAtomic: "7250000",
      id: "settlement-test",
      particleTransactionId: "test_transaction",
      tokenChanges: [
        {
          amountAtomic: "7250000",
          chainId: 42161,
          receiver: "0x1111111111111111111111111111111111111111",
          tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        },
      ],
      txHash: null,
      verificationMethod: "simulated_test",
      verificationTrigger: "inline",
      verifiedAt: createdAt,
    },
    status: "settled",
    tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    tokenChainId: 42161,
    webhook: null,
    ...overrides,
  };
}

describe("dashboard transaction reality labels", () => {
  it("renders mode-specific empty guidance", () => {
    const testHtml = renderToStaticMarkup(<TransactionsEmptyState mode="test" />);
    const liveHtml = renderToStaticMarkup(<TransactionsEmptyState mode="live" />);

    expect(testHtml).toContain("make a test payment");
    expect(liveHtml).toContain("Verified live payments will appear here");
    expect(liveHtml).toContain("Test payments stay in Test mode");
    expect(liveHtml).not.toContain("make a test payment");
  });

  it("labels simulated test evidence without exposing payer email", () => {
    const html = renderToStaticMarkup(<TransactionsTable rows={[transaction()]} search={{}} />);

    expect(html).toContain("TEST");
    expect(html).toContain("Sandbox simulation");
    expect(html).toContain("No delivery");
    expect(html).not.toContain("private-payer@example.test");
  });

  it("keeps a reported live candidate pending and unverified", () => {
    const html = renderToStaticMarkup(
      <TransactionsTable
        rows={[
          transaction({
            env: "live",
            paymentId: "payment-live",
            refCode: "TAB-LIVE",
            reportedTransactionId: "live_candidate",
            settlement: null,
            status: "pending",
          }),
        ]}
        search={{}}
      />,
    );

    expect(html).toContain("Pending");
    expect(html).toContain("Unverified");
    expect(html).not.toContain("Sandbox simulation");
    expect(html).not.toContain("TEST");
  });

  it("renders URL-backed filter controls and active values", () => {
    const html = renderToStaticMarkup(
      <TransactionsFilters
        search={{ payerType: "agent", status: "settled", webhookResult: "delivered" }}
      />,
    );

    expect(html).toContain('name="status"');
    expect(html).toContain('name="payer"');
    expect(html).toContain('name="webhook"');
    expect(html).toContain("Status: Settled");
    expect(html).toContain("Payer: Agent");
    expect(html).toContain("Webhook: Delivered");
  });

  it("renders real detail evidence but no email or explorer link for simulated test data", () => {
    const html = renderToStaticMarkup(<TransactionDetail row={transaction()} search={{}} />);

    expect(html).toContain("Sandbox settlement — simulated, no funds moved");
    expect(html).toContain("0x2222222222222222222222222222222222222222");
    expect(html).toContain("https://merchant.example.test/api/tab/intent");
    expect(html).toContain("amountAtomic");
    expect(html).toContain("View raw JSON");
    expect(html).not.toContain("private-payer@example.test");
    expect(html).not.toContain("explorer ↗");
  });

  it("links to the chain-derived explorer only for a stored canonical transaction hash", () => {
    const txHash = `0x${"a".repeat(64)}`;
    const settlement = transaction().settlement;
    if (!settlement) throw new Error("Expected settlement evidence");
    const html = renderToStaticMarkup(
      <TransactionDetail
        row={transaction({
          env: "live",
          settlement: {
            ...settlement,
            txHash,
            verificationMethod: "rpc",
          },
        })}
        search={{}}
      />,
    );

    expect(html).toContain(`href="https://arbiscan.io/tx/${txHash}"`);
    expect(html).toContain("View on Arbitrum One explorer");
  });
});
