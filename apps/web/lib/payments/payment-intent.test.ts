import { describe, expect, it } from "vitest";

import {
  InvalidPaymentIntentError,
  parseIntentAuditUrl,
  parsePaymentIntent,
} from "./payment-intent";

const receiver = "0x1111111111111111111111111111111111111111";
const tokenAddress = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

function intent(overrides: Record<string, unknown> = {}) {
  return {
    amount: "12.340000",
    currency: "USD",
    receiver,
    token: { address: tokenAddress, chainId: 42161 },
    ...overrides,
  };
}

describe("parsePaymentIntent", () => {
  it("preserves exact decimal money and normalizes pinned addresses", () => {
    expect(parsePaymentIntent(intent())).toEqual({
      amount: "12.340000",
      currency: "USD",
      receiver,
      token: { address: tokenAddress, chainId: 42161 },
    });
  });

  it.each([
    "0",
    "0.000000",
    "01.00",
    "1.0000000",
    "1e2",
    "100000000000000.00",
  ])("rejects a non-canonical amount: %s", (amount) => {
    expect(() => parsePaymentIntent(intent({ amount }))).toThrow(InvalidPaymentIntentError);
  });

  it("rejects any receiver, currency, chain, or token outside the product contract", () => {
    expect(() => parsePaymentIntent(intent({ currency: "EUR" }))).toThrow(
      InvalidPaymentIntentError,
    );
    expect(() => parsePaymentIntent(intent({ receiver: "not-an-address" }))).toThrow(
      InvalidPaymentIntentError,
    );
    expect(() =>
      parsePaymentIntent(intent({ token: { address: tokenAddress, chainId: 8453 } })),
    ).toThrow(InvalidPaymentIntentError);
    expect(() =>
      parsePaymentIntent(
        intent({
          token: { address: "0x2222222222222222222222222222222222222222", chainId: 42161 },
        }),
      ),
    ).toThrow(InvalidPaymentIntentError);
  });

  it("rejects authority-bearing or unknown response fields", () => {
    expect(() => parsePaymentIntent(intent({ merchantId: "attacker-controlled" }))).toThrow(
      InvalidPaymentIntentError,
    );
  });
});

describe("parseIntentAuditUrl", () => {
  it.each([
    "http://localhost:3000/api/demo/intent",
    "http://127.0.0.1:3000/api/demo/intent",
    "http://[::1]:3000/api/demo/intent",
  ])("permits loopback HTTP for a real local checkout: %s", (url) => {
    expect(parseIntentAuditUrl(url)).toBe(url);
  });

  it.each([
    "http://tab.example.test/api/demo/intent",
    "http://localhost.example.test/api/demo/intent",
    "http://0.0.0.0:3000/api/demo/intent",
  ])("still rejects non-loopback HTTP: %s", (url) => {
    expect(() => parseIntentAuditUrl(url)).toThrow(InvalidPaymentIntentError);
  });
});
