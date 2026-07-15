import type { Metadata } from "next";
import Link from "next/link";

import styles from "../dashboard-page.module.css";

export const metadata: Metadata = {
  title: "Transactions · Tab",
};

export default function TransactionsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1>Transactions</h1>
        <div className={styles.pageActions}>
          <button
            disabled
            title="Available when the real payment ledger is connected"
            type="button"
          >
            Filter
          </button>
        </div>
      </div>

      <section className={styles.emptyCard}>
        <div className={styles.ledgerIcon} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span className={styles.developmentLabel}>DEVELOPMENT STATE</span>
        <h2>Payment ledger not connected yet</h2>
        <p>
          No transaction rows or counts are being simulated. This surface will read the real,
          merchant- and mode-scoped ledger after the payment API is connected.
        </p>
        <Link className={styles.primaryLink} href="/dashboard/quickstart">
          Open Quickstart
        </Link>
      </section>
    </div>
  );
}
