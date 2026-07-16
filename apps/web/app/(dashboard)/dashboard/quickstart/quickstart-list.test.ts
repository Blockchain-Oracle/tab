import { describe, expect, it } from "vitest";

import { formatWebhookDeliverySummary, tabServerSnippet } from "./quickstart-list";

describe("Quickstart webhook delivery summary", () => {
  it("only calls a successful attempt delivered", () => {
    expect(formatWebhookDeliverySummary("delivered", 42)).toBe("webhook delivered in 42ms");
    expect(formatWebhookDeliverySummary("retrying", 42)).toBe("webhook retry scheduled");
    expect(formatWebhookDeliverySummary("gave_up", 42)).toBe("webhook delivery gave up");
    expect(formatWebhookDeliverySummary(null, null)).toBe("webhook not sent");
  });
});

describe("Quickstart secret-key client snippet", () => {
  it("uses the decided one-argument Tab constructor and configured server API origin", () => {
    const snippet = tabServerSnippet("https://tab.example.test", "sk_test_••••last");

    expect(snippet).toContain("TAB_API_BASE_URL=https://tab.example.test");
    expect(snippet).toContain("new Tab(process.env.TAB_SECRET_KEY!)");
    expect(snippet).not.toContain("apiBaseUrl:");
  });
});
