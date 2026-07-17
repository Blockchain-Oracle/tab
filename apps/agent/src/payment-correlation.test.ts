import { describe, expect, it } from "vitest";

import { PaymentCorrelations } from "./payment-correlation.js";

describe("payment observation correlation lifecycle", () => {
  it("retains a failed payment through its replay window and evicts it at validBefore", () => {
    let nowSeconds = 100;
    const correlations = new PaymentCorrelations(() => nowSeconds);
    correlations.set("0xAB", "receipt-live", 110);

    expect(correlations.get("0xab")).toBe("receipt-live");
    nowSeconds = 109;
    expect(correlations.get("0xAB")).toBe("receipt-live");
    nowSeconds = 110;
    expect(correlations.get("0xab")).toBeNull();
  });

  it("only deletes the receipt correlated to the acknowledged signature", () => {
    const correlations = new PaymentCorrelations(() => 100);
    correlations.set("0xab", "receipt-live", 110);

    correlations.deleteIf("0xAB", "different-receipt");
    expect(correlations.get("0xab")).toBe("receipt-live");
    correlations.deleteIf("0xab", "receipt-live");
    expect(correlations.get("0xab")).toBeNull();
  });
});
