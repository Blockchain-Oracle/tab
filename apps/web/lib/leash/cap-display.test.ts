import { describe, expect, it } from "vitest";

import { deriveCapDisplay } from "./cap-display";

describe("Agent cap display", () => {
  it("keeps settled and pending spend separate while matching the committed cap total", () => {
    expect(
      deriveCapDisplay({
        capUsdCents: "1000",
        pendingAtomic: "800000",
        settledAtomic: "4200000",
      }),
    ).toEqual({
      approaching: false,
      atOrAboveLimit: false,
      capFillBasisPoints: "10000",
      capAtomic: "10000000",
      committedAtomic: "5000000",
      committedBasisPoints: "5000",
      overageAtomic: "0",
      overageFillBasisPoints: "0",
      pendingAtomic: "800000",
      pendingFillBasisPoints: "800",
      reservedAtomic: "800000",
      reservedFillBasisPoints: "800",
      revertedAtomic: "0",
      settledAtomic: "4200000",
      settledFillBasisPoints: "4200",
    });
  });

  it("renders an exact-cap pending reservation as full and explainable", () => {
    expect(
      deriveCapDisplay({
        capUsdCents: "1000",
        pendingAtomic: "1000000",
        settledAtomic: "9000000",
      }),
    ).toMatchObject({
      approaching: true,
      atOrAboveLimit: true,
      committedAtomic: "10000000",
      committedBasisPoints: "10000",
      overageAtomic: "0",
      overageFillBasisPoints: "0",
      pendingFillBasisPoints: "1000",
      settledFillBasisPoints: "9000",
    });
  });

  it("keeps matching reverted-call evidence distinct while reserving it in committed spend", () => {
    expect(
      deriveCapDisplay({
        capUsdCents: "100",
        pendingAtomic: "100000",
        revertedAtomic: "200000",
        settledAtomic: "300000",
      }),
    ).toMatchObject({
      committedAtomic: "600000",
      pendingAtomic: "100000",
      reservedAtomic: "300000",
      reservedFillBasisPoints: "3000",
      revertedAtomic: "200000",
      settledAtomic: "300000",
    });
  });

  it("scales a 101% overage against committed spend without inventing width", () => {
    expect(
      deriveCapDisplay({
        capUsdCents: "1000",
        pendingAtomic: "100000",
        settledAtomic: "10000000",
      }),
    ).toMatchObject({
      capFillBasisPoints: "9901",
      committedAtomic: "10100000",
      committedBasisPoints: "10100",
      overageAtomic: "100000",
      overageFillBasisPoints: "99",
      pendingFillBasisPoints: "99",
      settledFillBasisPoints: "9901",
    });
  });

  it("retains truthful settled and pending composition after a cap is lowered to 140%", () => {
    expect(
      deriveCapDisplay({
        capUsdCents: "1000",
        pendingAtomic: "6000000",
        settledAtomic: "8000000",
      }),
    ).toMatchObject({
      approaching: true,
      atOrAboveLimit: true,
      capFillBasisPoints: "7143",
      committedBasisPoints: "14000",
      overageAtomic: "4000000",
      overageFillBasisPoints: "2857",
      pendingFillBasisPoints: "4286",
      settledFillBasisPoints: "5714",
    });
  });

  it("represents no-cap as a distinct state without inventing percentages", () => {
    expect(
      deriveCapDisplay({
        capUsdCents: null,
        pendingAtomic: "0",
        settledAtomic: "0",
      }),
    ).toEqual({
      approaching: false,
      atOrAboveLimit: false,
      capFillBasisPoints: null,
      capAtomic: null,
      committedAtomic: "0",
      committedBasisPoints: null,
      overageAtomic: "0",
      overageFillBasisPoints: null,
      pendingAtomic: "0",
      pendingFillBasisPoints: null,
      reservedAtomic: "0",
      reservedFillBasisPoints: null,
      revertedAtomic: "0",
      settledAtomic: "0",
      settledFillBasisPoints: null,
    });
  });
});
