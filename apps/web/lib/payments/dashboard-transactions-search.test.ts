import { describe, expect, it } from "vitest";

import { parseDashboardTransactionSearch, transactionsHref } from "./dashboard-transactions-search";

describe("dashboard transaction URL state", () => {
  it("accepts only supported filters and a UUID detail id", () => {
    expect(
      parseDashboardTransactionSearch({
        cursor: "opaque-cursor",
        detail: "6f016748-b7e0-4ac3-84ac-84bd58c48f4e",
        payer: "agent",
        status: "settled",
        webhook: "retrying",
      }),
    ).toEqual({
      cursor: "opaque-cursor",
      detail: "6f016748-b7e0-4ac3-84ac-84bd58c48f4e",
      payerType: "agent",
      status: "settled",
      webhookResult: "retrying",
    });

    expect(
      parseDashboardTransactionSearch({
        detail: "not-a-payment-id",
        payer: "robot",
        status: "refunded",
        webhook: "invented",
      }),
    ).toEqual({});
  });

  it("preserves filters while explicitly replacing cursor and detail state", () => {
    const state = {
      cursor: "old-cursor",
      detail: "6f016748-b7e0-4ac3-84ac-84bd58c48f4e",
      payerType: "human" as const,
      status: "pending" as const,
      webhookResult: "none" as const,
    };

    expect(
      transactionsHref(state, {
        cursor: "next-cursor",
        detail: null,
      }),
    ).toBe("/dashboard/transactions?status=pending&payer=human&webhook=none&cursor=next-cursor");
  });
});
