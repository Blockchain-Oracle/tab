import { describe, expect, it } from "vitest";

import { deriveOrderPrefix, formatOrderNumber } from "./order-number";

describe("runtime demo order number", () => {
  it("derives a tenant-specific prefix at runtime", () => {
    expect(deriveOrderPrefix("North Shore Coffee")).toBe("NSC");
    expect(deriveOrderPrefix("  single  ")).toBe("SIN");
    expect(deriveOrderPrefix(null)).toBe("SHOP");
    expect(formatOrderNumber("North Shore Coffee", 42)).toBe("NSC-0042");
  });

  it("rejects non-positive or unsafe order sequences", () => {
    expect(() => formatOrderNumber("Merchant", 0)).toThrow();
    expect(() => formatOrderNumber("Merchant", Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });
});
