import type { PaymentRequirements } from "@x402/core/types";
import { describe, expect, it } from "vitest";

import {
  BASE_NETWORK,
  selectLeashPaymentRequirements,
  UnsupportedPaymentNetworkError,
} from "./routing.js";

function requirement(network: `${string}:${string}`, amount = "1000"): PaymentRequirements {
  return {
    amount,
    asset:
      network === "eip155:42161"
        ? "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"
        : "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    extra: { name: "USD Coin", version: "2" },
    maxTimeoutSeconds: 60,
    network,
    payTo: "0x1111111111111111111111111111111111111111",
    scheme: "exact",
  };
}

describe("CAIP-2 float routing", () => {
  it("prefers Base when a resource accepts both covered floats", () => {
    const selected = selectLeashPaymentRequirements(2, [
      requirement("eip155:42161"),
      requirement(BASE_NETWORK),
    ]);

    expect(selected.network).toBe(BASE_NETWORK);
  });

  it("selects Arbitrum when it is the covered option", () => {
    expect(selectLeashPaymentRequirements(2, [requirement("eip155:42161")]).network).toBe(
      "eip155:42161",
    );
  });

  it("fails closed for Polygon, Solana, and unknown networks", () => {
    expect(() =>
      selectLeashPaymentRequirements(2, [requirement("eip155:137"), requirement("solana:mainnet")]),
    ).toThrow(UnsupportedPaymentNetworkError);
  });

  it("rejects Permit2 requirements even on a supported network", () => {
    const permit2 = requirement(BASE_NETWORK);
    permit2.extra = { assetTransferMethod: "permit2" };

    expect(() => selectLeashPaymentRequirements(2, [permit2])).toThrow(
      UnsupportedPaymentNetworkError,
    );
  });

  it("rejects non-USDC assets on a supported network", () => {
    const otherToken = requirement(BASE_NETWORK);
    otherToken.asset = "0x3333333333333333333333333333333333333333";

    expect(() => selectLeashPaymentRequirements(2, [otherToken])).toThrow(
      UnsupportedPaymentNetworkError,
    );
  });
});
