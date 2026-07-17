import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/leash/cap" }));

import { LeashShell } from "./leash-shell";

describe("Leash control-plane shell", () => {
  it("renders only live Phase 7 destinations and an owner-scoped unread badge", () => {
    const html = renderToStaticMarkup(
      <LeashShell email="owner@example.test" unreadCount={3}>
        <main>Owner control plane</main>
      </LeashShell>,
    );

    expect(html).toContain('href="/leash"');
    expect(html).toContain('href="/leash/notifications"');
    expect(html).toContain('href="/leash/cap"');
    expect(html).toContain('href="/leash/connect"');
    expect(html).toContain("owner@example.test");
    expect(html).toContain("Owner control plane");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("3 unread notifications");
    expect(html).not.toContain('href="/leash/revocation"');
    expect(html).not.toContain('href="/leash/payments"');
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

  it("keeps the owner sign-out control available in the mobile shell", () => {
    const html = renderToStaticMarkup(
      <LeashShell email="owner@example.test" unreadCount={3}>
        <main>Owner control plane</main>
      </LeashShell>,
    );
    const css = readFileSync(new URL("./leash-shell.module.css", import.meta.url), "utf8");
    const mobileCss = css.slice(css.indexOf("@media (max-width: 760px)"));

    expect(html).toContain("Sign out");
    expect(html).toContain("owner@example.test");
    expect(mobileCss).not.toMatch(/\.sidebarBottom\s*\{[^}]*display:\s*none/);
    expect(mobileCss).toMatch(/\.accountMenu\s*\{[^}]*min-width:/);
  });
});
