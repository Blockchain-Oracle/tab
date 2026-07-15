"use client";

import { useState } from "react";

import { getMagicClient } from "../../lib/auth/magic-client";
import styles from "./dashboard-controls.module.css";

type DashboardAccountMenuProps = {
  businessName: string | null;
  email: string;
  publishableKey: string;
};

const MAGIC_LOGOUT_TIMEOUT_MS = 2_000;

async function bestEffortMagicLogout(publishableKey: string) {
  if (!publishableKey) return;

  const cleanup = (async () => {
    const magic = getMagicClient(publishableKey);
    if (await magic.user.isLoggedIn()) await magic.user.logout();
  })();
  await Promise.race([
    cleanup.catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, MAGIC_LOGOUT_TIMEOUT_MS)),
  ]);
}

export function DashboardAccountMenu({
  businessName,
  email,
  publishableKey,
}: DashboardAccountMenuProps) {
  const [error, setError] = useState<string>();
  const [signingOut, setSigningOut] = useState(false);
  const accountName = businessName?.trim() || "Business name not set";
  const initial = (businessName?.trim() || email).charAt(0).toUpperCase();

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError(undefined);

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Server logout failed");

      await bestEffortMagicLogout(publishableKey);
      window.location.assign("/login");
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
        <button disabled={signingOut} onClick={() => void signOut()} type="button">
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </div>
    </details>
  );
}
