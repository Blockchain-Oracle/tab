const ATOMIC_UNITS_PER_CENT = BigInt(10_000);
const FULL_BAR_BASIS_POINTS = BigInt(10_000);
const APPROACHING_BASIS_POINTS = BigInt(7_500);

type CapDisplayInput = {
  capUsdCents: string | null;
  pendingAtomic: string;
  settledAtomic: string;
};

function nonnegativeInteger(value: string, field: string) {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${field} must be a nonnegative integer`);
  }
  return BigInt(value);
}

function minimum(left: bigint, right: bigint) {
  return left < right ? left : right;
}

function roundedBasisPoints(value: bigint, scaleAtomic: bigint) {
  return (value * FULL_BAR_BASIS_POINTS + scaleAtomic / BigInt(2)) / scaleAtomic;
}

export function deriveCapDisplay(input: CapDisplayInput) {
  const pendingAtomic = nonnegativeInteger(input.pendingAtomic, "pendingAtomic");
  const settledAtomic = nonnegativeInteger(input.settledAtomic, "settledAtomic");
  const committedAtomic = settledAtomic + pendingAtomic;

  if (input.capUsdCents === null) {
    return {
      approaching: false,
      atOrAboveLimit: false,
      capAtomic: null,
      capFillBasisPoints: null,
      committedAtomic: committedAtomic.toString(),
      committedBasisPoints: null,
      overageAtomic: "0",
      overageFillBasisPoints: null,
      pendingAtomic: pendingAtomic.toString(),
      pendingFillBasisPoints: null,
      settledAtomic: settledAtomic.toString(),
      settledFillBasisPoints: null,
    };
  }

  const capUsdCents = nonnegativeInteger(input.capUsdCents, "capUsdCents");
  if (capUsdCents === BigInt(0)) throw new Error("capUsdCents must be positive");
  const capAtomic = capUsdCents * ATOMIC_UNITS_PER_CENT;
  const displayScaleAtomic = committedAtomic > capAtomic ? committedAtomic : capAtomic;
  const committedFill = roundedBasisPoints(committedAtomic, displayScaleAtomic);
  const settledFill = roundedBasisPoints(settledAtomic, displayScaleAtomic);
  const pendingFill = committedFill - settledFill;
  const capFill = roundedBasisPoints(minimum(capAtomic, displayScaleAtomic), displayScaleAtomic);
  const overageFill = committedAtomic > capAtomic ? FULL_BAR_BASIS_POINTS - capFill : BigInt(0);
  const committedBasisPoints = (committedAtomic * FULL_BAR_BASIS_POINTS) / capAtomic;

  return {
    approaching: committedBasisPoints >= APPROACHING_BASIS_POINTS,
    atOrAboveLimit: committedAtomic >= capAtomic,
    capAtomic: capAtomic.toString(),
    capFillBasisPoints: capFill.toString(),
    committedAtomic: committedAtomic.toString(),
    committedBasisPoints: committedBasisPoints.toString(),
    overageAtomic: (committedAtomic > capAtomic
      ? committedAtomic - capAtomic
      : BigInt(0)
    ).toString(),
    overageFillBasisPoints: overageFill.toString(),
    pendingAtomic: pendingAtomic.toString(),
    pendingFillBasisPoints: pendingFill.toString(),
    settledAtomic: settledAtomic.toString(),
    settledFillBasisPoints: settledFill.toString(),
  };
}
