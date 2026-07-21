"use client";

import { useState } from "react";

import styles from "./leash-chrome.module.css";

export function LeashAccountMenu({ email }: { email: string }) {
  const [error, setError] = useState<string>();
  const [needsMerchant, setNeedsMerchant] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [switching, setSwitching] = useState(false);

  async function switchWorkspace() {
    if (switching || signingOut) return;
    setSwitching(true);
    setError(undefined);
    setNeedsMerchant(false);

    try {
      const response = await fetch("/api/workspace/switch", { method: "POST" });
      const payload = (await response.json()) as {
        redirectTo?: string;
        error?: { code?: string };
      };
      if (response.status === 409 && payload.error?.code === "NO_MERCHANT_WORKSPACE") {
        setNeedsMerchant(true);
        setSwitching(false);
        return;
      }
      if (!response.ok || !payload.redirectTo) throw new Error("Switch failed");
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
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Server logout failed");
      window.location.assign("/agents/login");
    } catch {
      setError("Couldn’t sign out. Try again.");
      setSigningOut(false);
    }
  }

  return (
    <details className={styles.accountMenu}>
      <summary className={styles.accountSummary}>
        <span aria-hidden="true" className={styles.avatar}>
          {email.charAt(0).toUpperCase()}
        </span>
        <span className={styles.accountText}>
          <span className={styles.accountName}>Agent owner</span>
          <span className={styles.accountEmail}>{email}</span>
        </span>
        <span aria-hidden="true" className={styles.menuMark}>
          ···
        </span>
      </summary>
      <div className={styles.accountPopover}>
        <button
          disabled={switching || signingOut}
          onClick={() => void switchWorkspace()}
          type="button"
        >
          {switching ? "Switching…" : "Switch to Merchant dashboard"}
        </button>
        <p className={styles.popoverNote}>Opens on Testnet — Mainnet stays an explicit action.</p>
        {needsMerchant ? <a href="/signup">Create a Merchant workspace →</a> : null}
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
