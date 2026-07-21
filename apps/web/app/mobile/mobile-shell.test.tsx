import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/mobile/feed" }));

import { MobileShell } from "./mobile-shell";

describe("mobile monitor shell", () => {
  it("renders the real monitor navigation without prototype phone chrome", () => {
    const html = renderToStaticMarkup(
      <MobileShell email="owner@example.test" unreadCount={2}>
        <p>Live child</p>
      </MobileShell>,
    );

    expect(html).toContain("Tab monitor");
    expect(html).toContain("owner@example.test");
    expect(html).toContain("Live child");
    expect(html).toContain('href="/mobile/feed"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/agents/notifications"');
    expect(html).toContain("2 unread notifications");
    expect(html).not.toContain("9:41");
    expect(html).not.toContain(["Research Agent", "v2"].join(" "));
  });
});
