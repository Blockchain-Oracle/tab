import Link from "next/link";

import styles from "../dashboard-page.module.css";

interface TransactionsEmptyStateProps {
  mode: "live" | "test";
}

export function TransactionsEmptyState({ mode }: TransactionsEmptyStateProps) {
  return (
    <section className={styles.emptyCard}>
      <div className={styles.ledgerIcon} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <h2>No payments yet</h2>
      <p>
        {mode === "test"
          ? "Complete your integration and make a test payment — it will appear here."
          : "Verified live payments will appear here. Test payments stay in Test mode."}
      </p>
      <Link className={styles.primaryLink} href="/dashboard/quickstart">
        Open Quickstart
      </Link>
    </section>
  );
}
