import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CapPolicyView } from "../../../../lib/leash/cap-view";
import type { OwnerAgent } from "../../../../lib/leash/owner-agents";
import { LeashOverview } from "./leash-overview";

const agent = {
  agentAddress: null,
  clientName: null,
  clientVersion: null,
  connectionCount: 0,
  createdAt: new Date("2026-07-17T00:00:00.000Z"),
  firstSeenAt: null,
  id: "11111111-1111-4111-8111-111111111111",
  lastSeenAt: null,
  name: "Ledger agent",
  status: "provisioned",
  transport: null,
} satisfies OwnerAgent;

function overagePolicy(): CapPolicyView {
  return {
    agentId: agent.id,
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
    halted: true,
    spend: {
      approaching: true,
      atOrAboveLimit: true,
      blockedReceiptCount: 3,
      capAtomic: "10000000",
      capFillBasisPoints: "7143",
      committedAtomic: "14000000",
      committedBasisPoints: "14000",
      overageAtomic: "4000000",
      overageFillBasisPoints: "2857",
      pendingAtomic: "6000000",
      pendingFillBasisPoints: "4286",
      settledAtomic: "8000000",
      settledFillBasisPoints: "5714",
    },
  };
}

describe("Leash overview cap evidence", () => {
  it("renders exact overage scaling, status composition, and current-cycle blocked count", () => {
    const html = renderToStaticMarkup(
      <LeashOverview
        agent={agent}
        floats={null}
        keySummary={null}
        notifications={[]}
        policy={overagePolicy()}
        unreadCount={0}
      />,
    );

    expect(html).toContain("140%");
    expect(html).toContain("incl. $6.00 pending");
    expect(html).toContain("3 cap-blocked attempts this cycle");
    expect(html).toContain("$8.00 settled; $6.00 pending; $10.00 cap; $4.00 over cap");
    expect(html).toContain('style="width:57.14%"');
    expect(html).toContain('style="width:42.86%"');
    expect(html).toContain('style="width:28.57%"');
  });
});
