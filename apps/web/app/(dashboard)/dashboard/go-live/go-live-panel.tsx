"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "./go-live.module.css";

type Readiness = {
  liveApiKey: boolean;
  ready: boolean;
  testPayment: boolean;
  verifiedWebhook: boolean;
};

const checks = [
  { key: "liveApiKey", label: "Live API key created", href: "/dashboard/keys?env=live" },
  {
    key: "verifiedWebhook",
    label: "Webhook configured and verified",
    href: "/dashboard/webhooks",
  },
  { key: "testPayment", label: "Test payment completed", href: "https://try.runtab.xyz" },
] as const;

export function GoLivePanel({
  activated,
  readiness,
}: {
  activated: boolean;
  readiness: Readiness;
}) {
  const router = useRouter();
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function activate() {
    if (busy || (!readiness.ready && !acknowledged)) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/mode/go-live", {
        body: JSON.stringify({ acknowledgeIncomplete: !readiness.ready && acknowledged }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error("Activation failed");
      router.refresh();
    } catch {
      setError("Mainnet was not enabled. Your dashboard remains safely on Testnet.");
    } finally {
      setBusy(false);
    }
  }

  if (activated) {
    const incompleteChecks = checks.filter((check) => !readiness[check.key]);
    return (
      <section className={styles.success}>
        <span aria-hidden="true">{readiness.ready ? "✓" : "!"}</span>
        <h1>
          {readiness.ready ? "You’re ready for Mainnet" : "Mainnet is enabled with setup remaining"}
        </h1>
        <p>
          {readiness.ready
            ? "All readiness checks are confirmed. Select MAINNET in the sidebar when you want to view production data."
            : "You acknowledged the missing checks when Mainnet was enabled. No payment was created and no funds moved."}
        </p>
        {!readiness.ready ? (
          <ul className={styles.activatedChecklist}>
            {incompleteChecks.map((check) => (
              <li key={check.key}>
                <strong>{check.label}</strong>
                <Link href={check.href}>Complete setup</Link>
              </li>
            ))}
          </ul>
        ) : null}
        <Link href="/dashboard/transactions">Open Transactions</Link>
      </section>
    );
  }

  return (
    <section className={styles.card}>
      <header>
        <span className={styles.eyebrow}>GO LIVE</span>
        <h1>Enable Mainnet payments</h1>
        <p>
          These checks come from your account records. Incomplete items are warnings, and enabling
          Mainnet never creates a payment or moves funds.
        </p>
      </header>

      <div className={styles.checklist}>
        {checks.map((check) => {
          const complete = readiness[check.key];
          return (
            <div className={complete ? styles.complete : styles.incomplete} key={check.key}>
              <span aria-hidden="true">{complete ? "✓" : "!"}</span>
              <strong>{check.label}</strong>
              {complete ? <small>Confirmed</small> : <Link href={check.href}>Complete setup</Link>}
            </div>
          );
        })}
      </div>

      {!readiness.ready ? (
        <label className={styles.acknowledgement}>
          <input
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            type="checkbox"
          />
          <span>
            I understand the missing items above. Enable Mainnet without marking them complete.
          </span>
        </label>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}
      <footer>
        <Link href="/dashboard/transactions">Not now</Link>
        <button
          disabled={busy || (!readiness.ready && !acknowledged)}
          onClick={() => void activate()}
          type="button"
        >
          {busy ? "Enabling…" : "Enable Mainnet"}
        </button>
      </footer>
    </section>
  );
}
