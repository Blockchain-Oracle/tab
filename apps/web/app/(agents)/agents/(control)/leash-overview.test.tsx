import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import type { CapPolicyView } from "../../../../lib/leash/cap-view";
import type { OwnerAgent } from "../../../../lib/leash/owner-agents";
import { receiptView } from "../../../../lib/leash/receipt-view";
import { LeashOverview } from "./leash-overview";
import { connectionState } from "./overview-cards";

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
  paymentProfile: "mainnet",
  status: "provisioned",
  transport: null,
} satisfies OwnerAgent;
const receipt = receiptView({
  amountAtomic: "420000",
  amountUsd: "0.420000",
  asset: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  capAtomicAtAttempt: null,
  committedAtomicBefore: null,
  createdAt: new Date("2026-07-17T11:00:00.000Z"),
  id: "33333333-3333-4333-8333-333333333333",
  intendedNetwork: null,
  network: "eip155:8453",
  origin: { clientName: "Claude Code", toolName: "search", transport: "mcp" },
  payTo: "0x1111111111111111111111111111111111111111",
  reason: null,
  resourceHost: "api.example.test",
  resourceUrl: "https://api.example.test/search",
  settledAt: null,
  status: "pending",
  txHash: null,
});

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
      reservedAtomic: "6000000",
      reservedFillBasisPoints: "4286",
      revertedAtomic: "0",
      settledAtomic: "8000000",
      settledFillBasisPoints: "5714",
    },
  };
}

describe("Leash overview cap evidence", () => {
  it("derives connection activity from heartbeat freshness, not revocation state", () => {
    const now = Date.parse("2026-07-17T10:05:00.000Z");
    expect(
      connectionState(
        { clientName: "Claude Code", lastSeenAt: new Date("2026-07-17T10:01:00.000Z") },
        now,
      ),
    ).toBe("Active");
    expect(
      connectionState(
        { clientName: "Claude Code", lastSeenAt: new Date("2026-07-17T09:59:00.000Z") },
        now,
      ),
    ).toBe("Idle");
  });

  it("renders exact overage scaling, status composition, and current-cycle blocked count", () => {
    const html = renderToStaticMarkup(
      <LeashOverview
        agent={agent}
        floats={null}
        keySummary={null}
        notifications={[]}
        policy={overagePolicy()}
        receipts={[receipt]}
        unreadCount={0}
      />,
    );

    expect(html).toContain("140%");
    expect(html).toContain("incl. $6.00 reserved / unsettled");
    expect(html).toContain("3 cap-blocked attempts this cycle");
    expect(html).toContain(
      "$8.00 settled; $6.00 awaiting result; $0.00 matching reverted-call evidence reserved; $10.00 cap; $4.00 over cap",
    );
    expect(html).toContain('style="width:57.14%"');
    expect(html).toContain('style="width:42.86%"');
    expect(html).toContain('style="width:28.57%"');
    expect(html).toContain('dateTime="2026-07-18T00:00:00.000Z"');
    expect(html).toContain("Recent payment attempts");
    expect(html).toContain("$0.42");
    expect(html).toContain("api.example.test");
    expect(html).toContain("Claude Code · search · mcp");
    expect(html).toContain(
      'href="/leash/receipts/33333333-3333-4333-8333-333333333333?agentId=11111111-1111-4111-8111-111111111111"',
    );
    expect(html).toContain('href="/leash/payments?agentId=11111111-1111-4111-8111-111111111111"');
    expect(html).toContain("OIDC setup blocked");
    expect(html).toContain("B-03 must pass before Tab can claim");
    expect(html).toContain("Payments halted at the cap");
    expect(html).toContain("Halted — cap reached");
    expect(html).toContain("Raise cap");
    expect(html).toContain("Revocation controls");
    expect(html).toContain("Daily · Countdown starting");
  });

  it("describes a nuked agent as an irreversible credential tombstone", () => {
    const html = renderToStaticMarkup(
      <LeashOverview
        agent={{ ...agent, status: "nuked" }}
        floats={null}
        keySummary={null}
        notifications={[]}
        policy={null}
        receipts={[]}
        unreadCount={0}
      />,
    );

    expect(html).toContain("Not provisioned — credential destroyed");
    expect(html).toContain("Provision new agent");
    expect(html).toContain("Leash cannot withdraw remaining floats");
    expect(html).not.toContain("Nuked — provisioning required");
  });

  it.each([
    ["paused", "Resume payments", "/leash/revocation?agentId="],
    ["frozen", "Unfreeze signer", "/leash/revocation?agentId="],
    ["cancelled", "Provision new agent", "/leash/provision?agentId="],
  ] as const)("renders the accepted %s state action", (status, action, href) => {
    const policy = overagePolicy();
    const html = renderToStaticMarkup(
      <LeashOverview
        agent={{ ...agent, status }}
        floats={null}
        keySummary={null}
        notifications={[]}
        policy={{
          ...policy,
          halted: false,
          spend: { ...policy.spend, approaching: false, atOrAboveLimit: false },
        }}
        receipts={[]}
        unreadCount={0}
      />,
    );
    expect(html).toContain(action);
    expect(html).toContain(href);
  });

  it("renders an honest low-float warning from live native-USDC reads", () => {
    const html = renderToStaticMarkup(
      <LeashOverview
        agent={{ ...agent, agentAddress: "0x1111111111111111111111111111111111111111" }}
        floats={[
          { balanceAtomic: "1000000", label: "Base", network: "eip155:8453" },
          { balanceAtomic: "0", label: "Arbitrum", network: "eip155:42161" },
        ]}
        keySummary={null}
        notifications={[
          {
            createdAt: new Date("2026-07-17T10:00:00.000Z"),
            id: "44444444-4444-4444-8444-444444444444",
            metadata: {},
            resourceHost: null,
            tier: "2",
            type: "float_low",
          },
        ]}
        policy={{
          ...overagePolicy(),
          halted: false,
          spend: {
            ...overagePolicy().spend,
            approaching: false,
            atOrAboveLimit: false,
          },
        }}
        receipts={[]}
        unreadCount={0}
      />,
    );
    expect(html).toContain("Agent float is low");
    expect(html).toContain(">LOW<");
    expect(html).toContain("$1.00 remains, below the fixed $5 floor");
    expect(html).toContain("Percentage threshold is unavailable until a real top-up event exists");
    expect(html).toContain("Add funds");
    expect(html).toContain("Open funds");
  });

  it("shows stored connection evidence, state, management, and address funding action", () => {
    const html = renderToStaticMarkup(
      <LeashOverview
        agent={{
          ...agent,
          agentAddress: "0x1111111111111111111111111111111111111111",
          clientName: "Claude Code",
          connectionCount: 2,
          lastSeenAt: new Date("2026-07-17T10:00:00.000Z"),
          transport: "mcp",
        }}
        floats={[
          { balanceAtomic: "6000000", label: "Base", network: "eip155:8453" },
          { balanceAtomic: "0", label: "Arbitrum", network: "eip155:42161" },
        ]}
        keySummary={null}
        notifications={[]}
        policy={null}
        receipts={[]}
        unreadCount={0}
      />,
    );
    expect(html).toContain("Claude Code");
    expect(html).toContain("Active");
    expect(html).toContain("Last seen");
    expect(html).toContain('dateTime="2026-07-17T10:00:00.000Z"');
    expect(html).toContain("Manage connection");
    expect(html).toContain("Add funds");
  });

  it("labels an integration agent and describes only its Base Sepolia test float", () => {
    const html = renderToStaticMarkup(
      <LeashOverview
        agent={{
          ...agent,
          agentAddress: "0x1111111111111111111111111111111111111111",
          paymentProfile: "base_sepolia_integration",
        }}
        floats={[{ balanceAtomic: "0", label: "Base Sepolia", network: "eip155:84532" }]}
        keySummary={null}
        notifications={[]}
        policy={null}
        receipts={[]}
        unreadCount={0}
      />,
    );

    expect(html).toContain("Test funds — not real money");
    expect(html).toContain("Base Sepolia test funds");
    expect(html).toContain("Live Base Sepolia test-fund read returned zero.");
    expect(html).not.toContain("Live Base and Arbitrum reads both returned zero.");
  });
});
