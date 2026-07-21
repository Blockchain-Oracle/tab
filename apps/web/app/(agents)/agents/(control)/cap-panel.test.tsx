import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CapPolicyView } from "../../../../lib/leash/cap-view";
import { CapPanel } from "./cap-panel";

const agentId = "11111111-1111-4111-8111-111111111111";

function policy(overrides: Partial<CapPolicyView> = {}): CapPolicyView {
  return {
    agentId,
    cap: {
      amountUsdCents: "1000",
      frequency: "daily",
      updatedAt: "2026-07-17T10:00:00.000Z",
    },
    cycle: {
      id: "22222222-2222-4222-8222-222222222222",
      nextResetAt: "2026-07-18T00:00:00.000Z",
      startedAt: "2026-07-17T00:00:00.000Z",
    },
    halted: false,
    spend: {
      approaching: true,
      atOrAboveLimit: false,
      blockedReceiptCount: 0,
      capFillBasisPoints: "10000",
      capAtomic: "10000000",
      committedAtomic: "7600000",
      committedBasisPoints: "7600",
      overageAtomic: "0",
      overageFillBasisPoints: "0",
      pendingAtomic: "1600000",
      pendingFillBasisPoints: "1600",
      reservedAtomic: "1600000",
      reservedFillBasisPoints: "1600",
      revertedAtomic: "0",
      settledAtomic: "6000000",
      settledFillBasisPoints: "6000",
    },
    ...overrides,
  };
}

describe("Leash cap control reality states", () => {
  it("shows the real no-cap hard gate instead of an uncapped active state", () => {
    const html = renderToStaticMarkup(<CapPanel agentId={agentId} initialPolicy={null} />);

    expect(html).toContain("Set a cap to enable payments");
    expect(html).toContain("signer refuses every payment");
    expect(html).toContain("Create cap");
    expect(html).not.toContain("Unlimited");
  });

  it("renders settled and reserved authorizations as distinct exact ledger segments", () => {
    const html = renderToStaticMarkup(<CapPanel agentId={agentId} initialPolicy={policy()} />);

    expect(html).toContain("$7.60");
    expect(html).toContain("$10.00");
    expect(html).toContain("incl. $1.60 reserved");
    expect(html).toContain("76%");
    expect(html).toContain("Settled");
    expect(html).toContain("Reserved / unsettled");
    expect(html).toContain("no overage");
    expect(html).toContain("No cap-blocked attempts this cycle");
    expect(html).toContain('dateTime="2026-07-18T00:00:00.000Z"');
  });

  it("scales a lowered-cap overage and exposes value-rich ledger evidence", () => {
    const base = policy();
    if (base.spend.capAtomic === null) throw new Error("Expected a configured cap fixture");
    const overage = policy({
      halted: true,
      spend: {
        ...base.spend,
        atOrAboveLimit: true,
        blockedReceiptCount: 2,
        capFillBasisPoints: "7143",
        committedAtomic: "14000000",
        committedBasisPoints: "14000",
        overageAtomic: "4000000",
        overageFillBasisPoints: "2857",
        pendingAtomic: "6000000",
        pendingFillBasisPoints: "4286",
        reservedAtomic: "6000000",
        reservedFillBasisPoints: "4286",
        revertedAtomic: "0",
        settledAtomic: "8000000",
        settledFillBasisPoints: "5714",
      },
    });
    const html = renderToStaticMarkup(<CapPanel agentId={agentId} initialPolicy={overage} />);

    expect(html).toContain("Payments halted");
    expect(html).toContain("140%");
    expect(html).toContain("$4.00 over the current cap");
    expect(html).toContain("2 cap-blocked attempts this cycle");
    expect(html).toContain(
      "$8.00 settled; $6.00 awaiting result; $0.00 matching reverted-call evidence reserved; $10.00 cap; $4.00 over cap",
    );
    expect(html).toContain('style="width:57.14%"');
    expect(html).toContain('style="width:42.86%"');
    expect(html).toContain('style="width:28.57%"');
  });
});
