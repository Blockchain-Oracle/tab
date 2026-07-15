import { describe, expect, it } from "vitest";

import { mintPaymentRefCode } from "./ref-code";

describe("mintPaymentRefCode", () => {
  it("mints the canonical TAB reference required by the database contract", () => {
    const refCode = mintPaymentRefCode(Buffer.from([0, 1, 2, 3, 4]));

    expect(refCode).toMatch(/^TAB-[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  it("requires enough entropy for a 40-bit reference suffix", () => {
    expect(() => mintPaymentRefCode(Buffer.alloc(4))).toThrow(
      "Payment references require exactly 5 random bytes",
    );
  });
});
