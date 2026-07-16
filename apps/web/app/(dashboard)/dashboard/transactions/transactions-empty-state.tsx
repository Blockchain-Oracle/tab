import Link from "next/link";

import styles from "../dashboard-page.module.css";

interface TransactionsEmptyStateProps {
  filtered?: boolean;
  mode: "live" | "test";
}

export function TransactionsEmptyState({ filtered = false, mode }: TransactionsEmptyStateProps) {
  return (
    <section className={styles.emptyCard}>
      <div className={styles.ledgerIcon} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <h2>{filtered ? "No matching payments" : "No payments yet"}</h2>
      <p>
        {filtered
          ? "No payments in this mode match all selected filters."
          : mode === "test"
            ? "Complete your integration and make a test payment — it will appear here."
            : "Verified live payments will appear here. Test payments stay in Test mode."}
      </p>
      <Link
        className={styles.primaryLink}
        href={filtered ? "/dashboard/transactions" : "/dashboard/quickstart"}
      >
        {filtered ? "Clear filters" : "Open Quickstart"}
      </Link>
    </section>
  );
}
