import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { DashboardTransaction } from "../../../../lib/payments/dashboard-transactions";
import { TransactionsEmptyState } from "./transactions-empty-state";
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
    payerEmail: "private-payer@example.test",
    payerType: "human",
    paymentId: "payment-test",
    refCode: "TAB-TEST",
    reportedTransactionId: "test_transaction",
    settlement: {
      id: "settlement-test",
      particleTransactionId: "test_transaction",
      txHash: null,
      verificationMethod: "simulated_test",
      verifiedAt: createdAt,
    },
    status: "settled",
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
    const html = renderToStaticMarkup(<TransactionsTable hasMore={false} rows={[transaction()]} />);

    expect(html).toContain("TEST");
    expect(html).toContain("Simulated test");
    expect(html).toContain("No delivery");
    expect(html).not.toContain("private-payer@example.test");
  });

  it("keeps a reported live candidate pending and unverified", () => {
    const html = renderToStaticMarkup(
      <TransactionsTable
        hasMore={false}
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
      />,
    );

    expect(html).toContain("Pending");
    expect(html).toContain("Unverified");
    expect(html).not.toContain("Simulated test");
    expect(html).not.toContain("TEST");
  });
});
