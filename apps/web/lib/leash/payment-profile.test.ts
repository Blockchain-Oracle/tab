import { describe, expect, it } from "vitest";

import {
  InvalidPaymentProfileError,
  networksForPaymentProfile,
  provisioningPaymentProfile,
} from "./payment-profile";

describe("server-authoritative Leash payment profiles", () => {
  it("keeps production on mainnet by default", () => {
    expect(provisioningPaymentProfile({})).toBe("mainnet");
    expect(networksForPaymentProfile("mainnet")).toEqual([
      expect.objectContaining({ network: "eip155:8453", testFunds: false }),
      expect.objectContaining({ network: "eip155:42161", testFunds: false }),
    ]);
  });

  it("enables only Base Sepolia through the explicit integration profile", () => {
    expect(
      provisioningPaymentProfile({ LEASH_PROVISIONING_PROFILE: "base_sepolia_integration" }),
    ).toBe("base_sepolia_integration");
    expect(networksForPaymentProfile("base_sepolia_integration")).toEqual([
      {
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        chainId: 84_532,
        domainName: "USDC",
        explorerOrigin: "https://sepolia.basescan.org",
        label: "Base Sepolia",
        network: "eip155:84532",
        rpcEnvironmentName: "BASE_SEPOLIA_RPC_URL",
        testFunds: true,
      },
    ]);
  });

  it("fails closed for unknown configuration without falling back", () => {
    expect(() => provisioningPaymentProfile({ LEASH_PROVISIONING_PROFILE: "testnet" })).toThrow(
      InvalidPaymentProfileError,
    );
    expect(() => networksForPaymentProfile("unknown" as never)).toThrow(InvalidPaymentProfileError);
  });
});
