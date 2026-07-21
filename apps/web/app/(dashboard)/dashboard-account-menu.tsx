"use client";

import { useState } from "react";

import styles from "./dashboard-controls.module.css";
import { signOutOfTab } from "./tab-sign-out";

type DashboardAccountMenuProps = {
  businessName: string | null;
  email: string;
};

export function DashboardAccountMenu({ businessName, email }: DashboardAccountMenuProps) {
  const [error, setError] = useState<string>();
  const [signingOut, setSigningOut] = useState(false);
  const [switching, setSwitching] = useState(false);
  const accountName = businessName?.trim() || "Business name not set";
  const initial = (businessName?.trim() || email).charAt(0).toUpperCase();

  async function switchWorkspace() {
    if (switching || signingOut) return;
    setSwitching(true);
    setError(undefined);

    try {
      const response = await fetch("/api/workspace/switch", { method: "POST" });
      const payload = (await response.json()) as { redirectTo?: string; message?: string };
      if (!response.ok || !payload.redirectTo) {
        throw new Error(payload.message ?? "Switch failed");
      }
      window.location.assign(payload.redirectTo);
    } catch {
      setError("Couldn’t switch workspaces. Try again.");
      setSwitching(false);
    }
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError(undefined);

    try {
      await signOutOfTab(
        () => fetch("/api/auth/logout", { method: "POST" }),
        (path) => window.location.assign(path),
      );
    } catch {
      setError("Couldn’t sign out. Try again.");
      setSigningOut(false);
    }
  }

  return (
    <details className={styles.accountMenu}>
      <summary className={styles.accountSummary}>
        <span className={styles.avatar} aria-hidden="true">
          {initial}
        </span>
        <span className={styles.accountText}>
          <span className={styles.accountName}>{accountName}</span>
          <span className={styles.accountEmail}>{email}</span>
        </span>
        <span className={styles.menuMark} aria-hidden="true">
          ···
        </span>
      </summary>
      <div className={styles.accountPopover}>
        <button
          disabled={switching || signingOut}
          onClick={() => void switchWorkspace()}
          type="button"
        >
          {switching ? "Switching…" : "Switch to Agent workspace"}
        </button>
        <button
          className={styles.dangerAction}
          disabled={signingOut || switching}
          onClick={() => void signOut()}
          type="button"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </div>
    </details>
  );
}
