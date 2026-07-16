import Link from "next/link";

import {
  type DashboardTransactionSearch,
  transactionsHref,
} from "../../../../lib/payments/dashboard-transactions-search";
import styles from "./transactions-controls.module.css";

interface TransactionsPaginationProps {
  count: number;
  nextCursor: string | null;
  previousCursor: string | null;
  search: DashboardTransactionSearch;
}

function control(label: string, cursor: string | null, search: DashboardTransactionSearch) {
  return cursor ? (
    <Link href={transactionsHref(search, { cursor, detail: null })}>{label}</Link>
  ) : (
    <span aria-disabled="true">{label}</span>
  );
}

export function TransactionsPagination({
  count,
  nextCursor,
  previousCursor,
  search,
}: TransactionsPaginationProps) {
  return (
    <footer className={styles.pagination}>
      <span>
        {count} {count === 1 ? "payment" : "payments"} on this page
      </span>
      <nav aria-label="Transaction pages">
        {control("Previous", previousCursor, search)}
        {control("Next", nextCursor, search)}
      </nav>
    </footer>
  );
}
