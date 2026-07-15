import { describe, expect, it } from "vitest";

import { InvalidPaymentReportError, parsePaymentReportRequest } from "./payment-report-request";

function report(overrides: Record<string, unknown> = {}) {
  return {
    buyerDidToken: "buyer.magic.did.token",
    tokenChanges: [{ from: "0x1111111111111111111111111111111111111111" }],
    transactionId: "opaque-particle-transaction-id",
    ...overrides,
  };
}

describe("payment report request parsing", () => {
  it("preserves the normalized Tab evidence array and opaque identifier", () => {
    expect(parsePaymentReportRequest(report())).toEqual(report());
  });

  it.each([
    null,
    [],
    {},
    report({ buyerDidToken: "" }),
    report({ transactionId: "contains whitespace" }),
    report({ transactionId: "candidate\u0000id" }),
    report({ transactionId: "candidate\u007fid" }),
    report({ tokenChanges: {} }),
    report({ tokenChanges: [] }),
    report({ tokenChanges: ["not-an-object"] }),
    report({ tokenChanges: [{ amount: Number.POSITIVE_INFINITY }] }),
    report({ tokenChanges: [{ amount: Number.MAX_SAFE_INTEGER + 1 }] }),
    report({ tokenChanges: [{ amount: undefined }] }),
    { ...report(), receiver: "caller-authority" },
  ])("rejects malformed or authority-bearing input: %#", (value) => {
    expect(() => parsePaymentReportRequest(value)).toThrow(InvalidPaymentReportError);
  });

  it("bounds DID tokens and normalized evidence payloads", () => {
    expect(() => parsePaymentReportRequest(report({ buyerDidToken: "x".repeat(8_193) }))).toThrow(
      InvalidPaymentReportError,
    );
    expect(() =>
      parsePaymentReportRequest(report({ tokenChanges: [{ data: "x".repeat(100_000) }] })),
    ).toThrow(InvalidPaymentReportError);
  });
});
