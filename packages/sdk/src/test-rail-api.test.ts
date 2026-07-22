import { describe, expect, it } from "vitest";

import { CheckoutApiError } from "./checkout-types";
import {
  grantDeliveredUsdc,
  parseTestBalance,
  parseTestFundsGrant,
  testUsdBalance,
} from "./test-rail-api";

describe("test balance parsing", () => {
  it("accepts only an atomic digit string", () => {
    expect(parseTestBalance({ balance: { gasWei: "1", usdcAtomic: "2000000" } })).toEqual({
      gasWei: 1n,
      usdcAtomic: 2_000_000n,
    });
    for (const bad of [
      {},
      { balance: {} },
      { balance: { usdcAtomic: 2000000 } },
      { balance: { usdcAtomic: "2.5" } },
      { balance: { usdcAtomic: "-1" } },
    ]) {
      expect(() => parseTestBalance(bad)).toThrow(CheckoutApiError);
    }
  });

  it("converts 6-decimal USDC to dollars without inflation", () => {
    expect(testUsdBalance(2_000_000n)).toBe(2);
    expect(testUsdBalance(0n)).toBe(0);
    expect(testUsdBalance(1_250_000n)).toBe(1.25);
  });
});

describe("test funds grant parsing", () => {
  const fundedLeg = {
    asset: "usdc",
    explorerTxUrl: "https://sepolia.basescan.org/tx/0xabc",
    state: "funded",
    txHash: "0xabc",
  };

  it("parses a truthful grant report", () => {
    const grant = parseTestFundsGrant({
      grant: {
        legs: [fundedLeg, { asset: "gas", blocker: "dry", state: "failed" }],
        state: "partial",
      },
    });
    expect(grant.state).toBe("partial");
    expect(grant.legs).toHaveLength(2);
    expect(grant.legs[1]?.blocker).toBe("dry");
  });

  it("rejects unknown states rather than inventing money outcomes", () => {
    for (const bad of [
      {},
      { grant: { legs: [], state: "settled" } },
      { grant: { legs: [{ asset: "usdc", state: "granted" }], state: "funded" } },
      { grant: { legs: [{ asset: "eth", state: "funded" }], state: "funded" } },
    ]) {
      expect(() => parseTestFundsGrant(bad)).toThrow(CheckoutApiError);
    }
  });

  it("counts USDC delivery only from funded or already-funded USDC legs", () => {
    expect(
      grantDeliveredUsdc({ legs: [{ asset: "usdc", state: "funded" }], state: "partial" }),
    ).toBe(true);
    expect(
      grantDeliveredUsdc({ legs: [{ asset: "usdc", state: "already-funded" }], state: "funded" }),
    ).toBe(true);
    expect(
      grantDeliveredUsdc({
        legs: [
          { asset: "gas", state: "funded" },
          { asset: "usdc", state: "failed" },
        ],
        state: "partial",
      }),
    ).toBe(false);
  });
});
