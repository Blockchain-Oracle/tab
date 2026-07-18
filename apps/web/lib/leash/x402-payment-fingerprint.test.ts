import { describe, expect, it } from "vitest";

import { fingerprintX402Payment, paymentFingerprintMatches } from "./x402-payment-fingerprint";

describe("bounded x402 replay fingerprint", () => {
  it("is canonical across key order but binds the exact signature", () => {
    const first = fingerprintX402Payment({
      accepted: { network: "eip155:84532", scheme: "exact" },
      payload: { authorization: { nonce: "0x12", value: "1000" }, signature: "0xaaaa" },
      x402Version: 2,
    });
    const reordered = fingerprintX402Payment({
      x402Version: 2,
      payload: { signature: "0xaaaa", authorization: { value: "1000", nonce: "0x12" } },
      accepted: { scheme: "exact", network: "eip155:84532" },
    });
    const otherSignature = fingerprintX402Payment({
      accepted: { network: "eip155:84532", scheme: "exact" },
      payload: { authorization: { nonce: "0x12", value: "1000" }, signature: "0xbbbb" },
      x402Version: 2,
    });

    expect(first).toBe(reordered);
    expect(first).not.toBe(otherSignature);
    expect(paymentFingerprintMatches(first, reordered)).toBe(true);
    expect(paymentFingerprintMatches(first, otherSignature)).toBe(false);
  });

  it("rejects an oversized or unsupported payload before hashing", () => {
    expect(() => fingerprintX402Payment({ signature: "x".repeat(16_385) })).toThrow("bounded");
    expect(() => fingerprintX402Payment({ invalid: BigInt(1) })).toThrow("canonical");
  });
});
