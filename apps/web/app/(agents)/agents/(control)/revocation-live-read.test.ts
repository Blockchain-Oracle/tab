import { describe, expect, it } from "vitest";

import { parseLiveRead } from "./revocation-live-read";

const agentId = "11111111-1111-4111-8111-111111111111";
const readAt = "2026-07-17T10:30:00.000Z";

function response(paymentProfile: "mainnet" | "base_sepolia_integration", floats: unknown[]) {
  const testFunds = paymentProfile === "base_sepolia_integration";
  return {
    agentId,
    floats,
    health: "healthy",
    paymentProfile,
    readAt,
    testFunds,
    testFundsLabel: testFunds ? "Test funds — not real money" : null,
  };
}

describe("revocation live-read profile boundary", () => {
  it("accepts the exact two-network mainnet response", () => {
    expect(
      parseLiveRead(
        response("mainnet", [
          {
            balanceAtomic: "1000000",
            label: "Base",
            network: "eip155:8453",
            testFunds: false,
          },
          {
            balanceAtomic: "250000",
            label: "Arbitrum",
            network: "eip155:42161",
            testFunds: false,
          },
        ]),
        agentId,
        "mainnet",
      ),
    ).toEqual({ readAt, state: "available", totalAtomic: "1250000" });
  });

  it("accepts only the one-network Base Sepolia test-funds response", () => {
    expect(
      parseLiveRead(
        response("base_sepolia_integration", [
          {
            balanceAtomic: "1000",
            label: "Base Sepolia",
            network: "eip155:84532",
            testFunds: true,
          },
        ]),
        agentId,
        "base_sepolia_integration",
      ),
    ).toEqual({ readAt, state: "available", totalAtomic: "1000" });
  });

  it("fails closed when a mainnet agent receives a testnet-shaped response or vice versa", () => {
    const baseSepolia = response("base_sepolia_integration", [
      {
        balanceAtomic: "1000",
        label: "Base Sepolia",
        network: "eip155:84532",
        testFunds: true,
      },
    ]);
    expect(parseLiveRead(baseSepolia, agentId, "mainnet")).toMatchObject({ state: "unavailable" });
    expect(
      parseLiveRead(
        { ...baseSepolia, testFundsLabel: "Mainnet", testFunds: false },
        agentId,
        "base_sepolia_integration",
      ),
    ).toMatchObject({ state: "unavailable" });

    const mainnetFloats = [
      {
        balanceAtomic: "1000000",
        label: "Base",
        network: "eip155:8453",
        testFunds: false,
      },
      {
        balanceAtomic: "250000",
        label: "Arbitrum",
        network: "eip155:42161",
        testFunds: false,
      },
    ];
    expect(
      parseLiveRead(
        { ...response("mainnet", mainnetFloats), paymentProfile: "base_sepolia_integration" },
        agentId,
        "mainnet",
      ),
    ).toMatchObject({ state: "unavailable" });
  });
});
