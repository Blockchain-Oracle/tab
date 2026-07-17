import { describe, expect, it } from "vitest";

import {
  capFillWidth,
  formatBasisPoints,
  formatCycleFrequency,
  formatRemaining,
  formatUsdAtomic,
  formatUsdCents,
} from "./leash-format";

describe("Leash exact display formatting", () => {
  it.each([
    ["0", "$0.00"],
    ["1230000", "$1.23"],
    ["1235000", "$1.24"],
    ["1234567890000", "$1,234,567.89"],
  ])("formats %s atomic USDC without floating point", (value, expected) => {
    expect(formatUsdAtomic(value)).toBe(expected);
  });

  it("formats arbitrarily large integer cents without Number coercion", () => {
    expect(formatUsdCents("99999999999999999999")).toBe("$999,999,999,999,999,999.99");
  });

  it("preserves exact percentages while clamping only the rendered bar", () => {
    expect(formatBasisPoints("7667")).toBe("76.67%");
    expect(formatBasisPoints("14000")).toBe("140%");
    expect(capFillWidth("14000")).toBe("100%");
  });

  it("renders real cycle language and countdowns", () => {
    expect(formatCycleFrequency("daily")).toBe("Daily");
    expect(formatCycleFrequency("never")).toBe("No automatic reset");
    expect(formatRemaining(null, new Date("2026-07-17T00:00:00Z"))).toBe("No scheduled reset");
    expect(
      formatRemaining(new Date("2026-07-18T02:31:00Z"), new Date("2026-07-17T00:00:00Z")),
    ).toBe("in 1d 2h 31m");
  });

  it.each(["-1", "1.2", "NaN", ""])("rejects invalid integer input %s", (value) => {
    expect(() => formatUsdAtomic(value)).toThrow();
  });
});
