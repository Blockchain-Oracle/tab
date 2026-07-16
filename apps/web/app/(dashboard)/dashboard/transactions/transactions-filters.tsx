import Link from "next/link";

import {
  type DashboardTransactionSearch,
  transactionsHref,
} from "../../../../lib/payments/dashboard-transactions-search";
import styles from "./transactions-controls.module.css";

interface TransactionsFiltersProps {
  search: DashboardTransactionSearch;
}

const labels = {
  payerType: { agent: "Agent", human: "Human" },
  status: { failed: "Failed", pending: "Pending", settled: "Settled" },
  webhookResult: {
    delivered: "Delivered",
    failed: "Failed",
    gave_up: "Gave up",
    none: "No delivery",
    pending: "Pending",
    retrying: "Retrying",
    timeout: "Timed out",
  },
} as const;

export function TransactionsFilters({ search }: TransactionsFiltersProps) {
  const active = [
    search.status
      ? {
          href: transactionsHref(search, { cursor: null, detail: null, status: null }),
          label: `Status: ${labels.status[search.status]}`,
        }
      : null,
    search.payerType
      ? {
          href: transactionsHref(search, { cursor: null, detail: null, payerType: null }),
          label: `Payer: ${labels.payerType[search.payerType]}`,
        }
      : null,
    search.webhookResult
      ? {
          href: transactionsHref(search, { cursor: null, detail: null, webhookResult: null }),
          label: `Webhook: ${labels.webhookResult[search.webhookResult]}`,
        }
      : null,
  ].filter((item): item is { href: string; label: string } => item !== null);

  return (
    <div className={styles.controls}>
      <details className={styles.filterDisclosure}>
        <summary>Filter{active.length ? ` (${active.length})` : ""}</summary>
        <form action="/dashboard/transactions" className={styles.filterForm} method="get">
          <label>
            Status
            <select defaultValue={search.status ?? ""} name="status">
              <option value="">All statuses</option>
              <option value="settled">Settled</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </label>
          <label>
            Payer
            <select defaultValue={search.payerType ?? ""} name="payer">
              <option value="">All payers</option>
              <option value="human">Human</option>
              <option value="agent">Agent</option>
            </select>
          </label>
          <label>
            Webhook
            <select defaultValue={search.webhookResult ?? ""} name="webhook">
              <option value="">All results</option>
              <option value="delivered">Delivered</option>
              <option value="pending">Pending</option>
              <option value="retrying">Retrying</option>
              <option value="failed">Failed</option>
              <option value="timeout">Timed out</option>
              <option value="gave_up">Gave up</option>
              <option value="none">No delivery</option>
            </select>
          </label>
          <div className={styles.filterActions}>
            <Link href="/dashboard/transactions">Clear</Link>
            <button type="submit">Apply filters</button>
          </div>
        </form>
      </details>
      {active.length ? (
        <nav className={styles.activeFilters} aria-label="Active transaction filters">
          {active.map((item) => (
            <Link href={item.href} key={item.label}>
              {item.label} <span aria-hidden="true">×</span>
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
