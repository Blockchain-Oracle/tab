import type { CapPolicySummary } from "./cap-policy-summary";
import { formatUsdAtomic, formatUsdCents } from "./leash-format";

export type CapPolicyView = Omit<CapPolicySummary, "cap" | "cycle"> & {
  cap: Omit<CapPolicySummary["cap"], "updatedAt"> & { updatedAt: string };
  cycle: Omit<CapPolicySummary["cycle"], "nextResetAt" | "startedAt"> & {
    nextResetAt: string | null;
    startedAt: string;
  };
};

export function capPolicyView(policy: CapPolicySummary): CapPolicyView {
  return {
    ...policy,
    cap: { ...policy.cap, updatedAt: policy.cap.updatedAt.toISOString() },
    cycle: {
      ...policy.cycle,
      nextResetAt: policy.cycle.nextResetAt?.toISOString() ?? null,
      startedAt: policy.cycle.startedAt.toISOString(),
    },
  };
}

export function blockedReceiptEvidence(count: number) {
  const attempts =
    count === 0
      ? "No cap-blocked attempts"
      : `${count} cap-blocked attempt${count === 1 ? "" : "s"}`;
  return `${attempts} this cycle · blocked and pre-sign failures are excluded; matching reverted-call evidence remains reserved.`;
}

export function capUsageDescription(policy: CapPolicyView) {
  const overage =
    BigInt(policy.spend.overageAtomic) > BigInt(0)
      ? `${formatUsdAtomic(policy.spend.overageAtomic)} over cap`
      : "no overage";
  return [
    "Current cycle cap usage:",
    `${formatUsdAtomic(policy.spend.settledAtomic)} settled;`,
    `${formatUsdAtomic(policy.spend.pendingAtomic)} awaiting result;`,
    `${formatUsdAtomic(policy.spend.revertedAtomic)} matching reverted-call evidence reserved;`,
    `${formatUsdCents(policy.cap.amountUsdCents)} cap;`,
    `${overage};`,
    blockedReceiptEvidence(policy.spend.blockedReceiptCount),
  ].join(" ");
}
