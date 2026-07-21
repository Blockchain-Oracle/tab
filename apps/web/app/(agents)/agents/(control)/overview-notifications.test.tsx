import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OverviewNotifications } from "./overview-notifications";

describe("Agent overview notifications", () => {
  it("shows the canonical MCP resource instead of the collapsed MCP host", () => {
    const html = renderToStaticMarkup(
      <OverviewNotifications
        agentId="11111111-1111-4111-8111-111111111111"
        notifications={[
          {
            createdAt: new Date("2026-07-17T10:00:00.000Z"),
            id: "22222222-2222-4222-8222-222222222222",
            metadata: { resourceUrl: "mcp://tool/search" },
            resourceHost: "tool",
            tier: "2",
            type: "unusual_domain",
          },
        ]}
        unreadCount={1}
      />,
    );

    expect(html).toContain("mcp://tool/search");
    expect(html).not.toContain(">tool<");
  });

  it("keeps a Base Sepolia float alert visibly labeled as test funds", () => {
    const html = renderToStaticMarkup(
      <OverviewNotifications
        agentId="11111111-1111-4111-8111-111111111111"
        notifications={[
          {
            createdAt: new Date("2026-07-17T10:00:00.000Z"),
            id: "22222222-2222-4222-8222-222222222222",
            metadata: {
              network: "eip155:84532",
              testFunds: true,
              testFundsLabel: "Sandbox funds — no real value",
            },
            resourceHost: null,
            tier: "2",
            type: "float_empty",
          },
        ]}
        unreadCount={1}
      />,
    );

    expect(html).toContain("Sandbox funds — no real value");
    expect(html).not.toContain("Cap policy event");
  });
});
