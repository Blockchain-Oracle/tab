"use client";

import { useState } from "react";

/**
 * The surface tag in the sidebar brand row, made clickable: one click
 * re-scopes the shared session to the other workspace (no second OTP).
 * An agent-only owner is routed to /signup to create the merchant side.
 */
export function WorkspaceSwitcher({ current }: { current: "agents" | "merchant" }) {
  const [switching, setSwitching] = useState(false);
  const target = current === "merchant" ? "Agents" : "Merchant";

  async function switchWorkspace() {
    if (switching) return;
    setSwitching(true);

    try {
      const response = await fetch("/api/workspace/switch", { method: "POST" });
      const payload = (await response.json()) as {
        redirectTo?: string;
        error?: { code?: string };
      };
      if (response.status === 409 && payload.error?.code === "NO_MERCHANT_WORKSPACE") {
        window.location.assign("/signup");
        return;
      }
      if (!response.ok || !payload.redirectTo) throw new Error("Switch failed");
      window.location.assign(payload.redirectTo);
    } catch {
      setSwitching(false);
    }
  }

  return (
    <button
      data-tab-shell-surface-tag=""
      disabled={switching}
      onClick={() => void switchWorkspace()}
      title={`Switch to the ${target} workspace`}
      type="button"
    >
      {switching ? "Switching…" : current === "merchant" ? "Merchant" : "Agents"}
      <span aria-hidden="true">⇄</span>
    </button>
  );
}
