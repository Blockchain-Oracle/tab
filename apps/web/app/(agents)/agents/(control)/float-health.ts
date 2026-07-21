export const FIXED_LOW_FLOAT_ATOMIC = BigInt(5_000_000);

type FloatRead = { balanceAtomic: string | null };

export type FloatHealth =
  | { state: "not_provisioned"; totalAtomic: null }
  | { state: "unavailable"; totalAtomic: null }
  | { state: "empty" | "low" | "funded"; totalAtomic: bigint };

export function classifyFloatHealth(
  reads: readonly FloatRead[] | null,
  hasAddress: boolean,
): FloatHealth {
  if (!reads) {
    return hasAddress
      ? { state: "unavailable", totalAtomic: null }
      : { state: "not_provisioned", totalAtomic: null };
  }
  if (reads.some((read) => read.balanceAtomic === null)) {
    return { state: "unavailable", totalAtomic: null };
  }
  const totalAtomic = reads.reduce(
    (total, read) => total + BigInt(read.balanceAtomic ?? "0"),
    BigInt(0),
  );
  if (totalAtomic === BigInt(0)) return { state: "empty", totalAtomic };
  if (totalAtomic < FIXED_LOW_FLOAT_ATOMIC) return { state: "low", totalAtomic };
  return { state: "funded", totalAtomic };
}
