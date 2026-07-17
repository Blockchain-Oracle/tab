import { describe, expect, it } from "vitest";

import { classifyFloatHealth, FIXED_LOW_FLOAT_ATOMIC } from "./float-health";

describe("fixed low-float classification", () => {
  it("uses the real $5 USDC floor and keeps incomplete reads unavailable", () => {
    expect(FIXED_LOW_FLOAT_ATOMIC).toBe(BigInt(5_000_000));
    expect(classifyFloatHealth(null, false).state).toBe("not_provisioned");
    expect(classifyFloatHealth(null, true).state).toBe("unavailable");
    expect(classifyFloatHealth([{ balanceAtomic: null }], true).state).toBe("unavailable");
    expect(classifyFloatHealth([{ balanceAtomic: "0" }], true).state).toBe("empty");
    expect(classifyFloatHealth([{ balanceAtomic: "4999999" }], true).state).toBe("low");
    expect(classifyFloatHealth([{ balanceAtomic: "5000000" }], true).state).toBe("funded");
  });
});
