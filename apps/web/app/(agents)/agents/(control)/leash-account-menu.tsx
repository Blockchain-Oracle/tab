"use client";

import { useState } from "react";

import styles from "./leash-chrome.module.css";

export function LeashAccountMenu({ email }: { email: string }) {
  const [error, setError] = useState<string>();
  const [signingOut, setSigningOut] = useState(false);

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
        <button disabled={signingOut} onClick={() => void signOut()} type="button">
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </div>
    </details>
  );
}
