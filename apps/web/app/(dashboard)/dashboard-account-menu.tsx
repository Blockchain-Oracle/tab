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
  const accountName = businessName?.trim() || "Business name not set";
  const initial = (businessName?.trim() || email).charAt(0).toUpperCase();

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
        <button disabled={signingOut} onClick={() => void signOut()} type="button">
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </div>
    </details>
  );
}
