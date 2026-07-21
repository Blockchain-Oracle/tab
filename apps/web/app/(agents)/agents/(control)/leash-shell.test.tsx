import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/agents/cap" }));

import { LeashShell } from "./leash-shell";

describe("agent control-plane shell", () => {
  it("renders the live control destinations and an owner-scoped unread badge", () => {
    const html = renderToStaticMarkup(
      <LeashShell email="owner@example.test" unreadCount={3}>
        <main>Owner control plane</main>
      </LeashShell>,
    );

    expect(html).toContain('href="/agents"');
    expect(html).toContain('href="/agents/notifications"');
    expect(html).toContain('href="/agents/payments"');
    expect(html).toContain('href="/agents/cap"');
    expect(html).toContain('href="/agents/funds"');
    expect(html).toContain('href="/agents/provision"');
    expect(html).toContain('href="/agents/revocation"');
    expect(html).toContain('href="/agents/connect"');
    expect(html).toContain("owner@example.test");
    expect(html).toContain("Owner control plane");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("3 unread notifications");
  });

  it("does not invent a zero badge when unread data is unavailable", () => {
    const html = renderToStaticMarkup(
      <LeashShell email="owner@example.test" unreadCount={null}>
        <main>Owner control plane</main>
      </LeashShell>,
    );

    expect(html).not.toContain("unread notifications");
    expect(html).not.toContain(">0<");
  });

  it("keeps the owner sign-out control and skip link in the shell", () => {
    const html = renderToStaticMarkup(
      <LeashShell email="owner@example.test" unreadCount={3}>
        <main>Owner control plane</main>
      </LeashShell>,
    );

    expect(html).toContain("Sign out");
    expect(html).toContain("owner@example.test");
    expect(html).toContain("Skip to content");
    expect(html).toContain('id="tab-main"');
  });
});
