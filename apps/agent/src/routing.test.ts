import type { PaymentRequirements } from "@x402/core/types";
import { describe, expect, it } from "vitest";

import {
  BASE_NETWORK,
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC,
  selectLeashPaymentRequirements,
  UnsupportedPaymentNetworkError,
} from "./routing.js";

function requirement(network: `${string}:${string}`, amount = "1000"): PaymentRequirements {
  return {
    amount,
    asset:
      network === "eip155:42161"
        ? "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"
        : network === BASE_SEPOLIA_NETWORK
          ? BASE_SEPOLIA_USDC
          : "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    extra: { name: network === BASE_SEPOLIA_NETWORK ? "USDC" : "USD Coin", version: "2" },
    maxTimeoutSeconds: 60,
    network,
    payTo: "0x1111111111111111111111111111111111111111",
    scheme: "exact",
  };
}

describe("CAIP-2 float routing", () => {
  it("prefers Base when a resource accepts both covered floats", () => {
    const selected = selectLeashPaymentRequirements("mainnet", 2, [
      requirement("eip155:42161"),
      requirement(BASE_NETWORK),
    ]);

    expect(selected.network).toBe(BASE_NETWORK);
  });

  it("selects Arbitrum when it is the covered option", () => {
    expect(
      selectLeashPaymentRequirements("mainnet", 2, [requirement("eip155:42161")]).network,
    ).toBe("eip155:42161");
  });

  it("isolates the Base Sepolia integration profile from both mainnet floats", () => {
    const challenge = [
      requirement(BASE_NETWORK),
      requirement(BASE_SEPOLIA_NETWORK),
      requirement("eip155:42161"),
    ];

    expect(selectLeashPaymentRequirements("base_sepolia_integration", 2, challenge).network).toBe(
      BASE_SEPOLIA_NETWORK,
    );
    expect(() =>
      selectLeashPaymentRequirements("mainnet", 2, [requirement(BASE_SEPOLIA_NETWORK)]),
    ).toThrow(UnsupportedPaymentNetworkError);
    expect(() =>
      selectLeashPaymentRequirements("base_sepolia_integration", 2, [
        requirement(BASE_NETWORK),
        requirement("eip155:42161"),
      ]),
    ).toThrow(UnsupportedPaymentNetworkError);
  });

  it("fails closed for Polygon, Solana, and unknown networks", () => {
    expect(() =>
      selectLeashPaymentRequirements("mainnet", 2, [
        requirement("eip155:137"),
        requirement("solana:mainnet"),
      ]),
    ).toThrow(UnsupportedPaymentNetworkError);
  });

  it("rejects Permit2 requirements even on a supported network", () => {
    const permit2 = requirement(BASE_NETWORK);
    permit2.extra = { assetTransferMethod: "permit2" };

    expect(() => selectLeashPaymentRequirements("mainnet", 2, [permit2])).toThrow(
      UnsupportedPaymentNetworkError,
    );
  });

  it("rejects non-USDC assets on a supported network", () => {
    const otherToken = requirement(BASE_NETWORK);
    otherToken.asset = "0x3333333333333333333333333333333333333333";

    expect(() => selectLeashPaymentRequirements("mainnet", 2, [otherToken])).toThrow(
      UnsupportedPaymentNetworkError,
    );
  });

  it("requires the Base Sepolia USDC EIP-712 name and version", () => {
    const wrongName = requirement(BASE_SEPOLIA_NETWORK);
    wrongName.extra = { name: "USD Coin", version: "2" };
    const wrongVersion = requirement(BASE_SEPOLIA_NETWORK);
    wrongVersion.extra = { name: "USDC", version: "1" };

    for (const invalid of [wrongName, wrongVersion]) {
      expect(() =>
        selectLeashPaymentRequirements("base_sepolia_integration", 2, [invalid]),
      ).toThrow(UnsupportedPaymentNetworkError);
    }
  });

  it("fails closed for legacy or unknown x402 versions", () => {
    for (const version of [1, 3]) {
      expect(() =>
        selectLeashPaymentRequirements("mainnet", version, [requirement(BASE_NETWORK)]),
      ).toThrow(UnsupportedPaymentNetworkError);
    }
  });
});
