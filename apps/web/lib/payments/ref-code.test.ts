import { describe, expect, it } from "vitest";

import { mintPaymentRefCode } from "./ref-code";

describe("mintPaymentRefCode", () => {
  it("derives the payment prefix from the runtime product name", () => {
    const refCode = mintPaymentRefCode("Tab", Buffer.from([0, 1, 2, 3, 4]));

    expect(refCode).toMatch(/^TAB-[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(mintPaymentRefCode("River Lane", Buffer.alloc(5, 1))).toMatch(/^RIV-/);
  });

  it("requires enough runtime entropy for a 40-bit reference suffix", () => {
    expect(() => mintPaymentRefCode("Tab", Buffer.alloc(4))).toThrow(
      "Payment references require exactly 5 random bytes",
    );
  });
});
