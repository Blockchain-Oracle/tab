import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import type { NotificationResultView } from "../../../../lib/leash/notification-view";
import { NotificationCenter } from "./notification-center";

const agentId = "11111111-1111-4111-8111-111111111111";

const result: NotificationResultView = {
  nextCursor: "older-page",
  notifications: [
    {
      agentId,
      createdAt: "2026-07-17T10:00:00.000Z",
      cta: {
        href: `/agents/cap?agentId=${agentId}#cap-controls`,
        kind: "cap_remediation",
        label: "Review cap",
      },
      cycleId: "22222222-2222-4222-8222-222222222222",
      id: "33333333-3333-4333-8333-333333333333",
      metadata: { attemptedAtomic: "450000", capAtomic: "10000000" },
      readAt: null,
      receiptId: "44444444-4444-4444-8444-444444444444",
      resolvedAt: null,
      resourceHost: null,
      sticky: true,
      tier: "3",
      type: "cap_blocked",
    },
    {
      agentId,
      createdAt: "2026-07-17T09:00:00.000Z",
      cta: null,
      cycleId: "22222222-2222-4222-8222-222222222222",
      id: "55555555-5555-4555-8555-555555555555",
      metadata: { resourceHost: "tool", resourceUrl: "mcp://tool/search" },
      readAt: "2026-07-17T09:30:00.000Z",
      receiptId: "66666666-6666-4666-8666-666666666666",
      resolvedAt: null,
      resourceHost: "tool",
      sticky: false,
      tier: "2",
      type: "unusual_domain",
    },
    {
      agentId,
      createdAt: "2026-07-17T08:00:00.000Z",
      cta: null,
      cycleId: "22222222-2222-4222-8222-222222222222",
      id: "77777777-7777-4777-8777-777777777777",
      metadata: {
        network: "eip155:84532",
        testFunds: true,
        testFundsLabel: "Testnet",
      },
      readAt: null,
      receiptId: "88888888-8888-4888-8888-888888888888",
      resolvedAt: null,
      resourceHost: null,
      sticky: false,
      tier: "2",
      type: "float_empty",
    },
  ],
  unreadCount: 1,
};

describe("Agent notification center", () => {
  it("renders real tiers, state, host, and remediation CTA", () => {
    const html = renderToStaticMarkup(
      <NotificationCenter agentId={agentId} initialResult={result} />,
    );

    expect(html).toContain("Action required");
    expect(html).toContain("Alert");
    expect(html).toContain("A $0.45 payment was blocked before signing");
    expect(html).toContain("mcp://tool/search");
    expect(html).toContain("Review cap");
    expect(html).toContain("1 unread");
    expect(html).toContain("Mark all read");
    expect(html).toContain("Load older");
    expect(html).toContain("Active &amp; resolved");
    expect(html).toContain("Testnet");
  });

  it("uses an instructive empty state without seeded alerts", () => {
    const html = renderToStaticMarkup(
      <NotificationCenter
        agentId={agentId}
        initialResult={{ nextCursor: null, notifications: [], unreadCount: 0 }}
      />,
    );

    expect(html).toContain("No notifications match this view");
    expect(html).toContain("Real cap, destination, and float events appear here");
  });
});
