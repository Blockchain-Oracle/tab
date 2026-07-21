import Link from "next/link";
import { chainDisplay } from "../../../../lib/payments/chain-display";
import type { DashboardTransaction } from "../../../../lib/payments/dashboard-transactions";
import {
  type DashboardTransactionSearch,
  transactionsHref,
} from "../../../../lib/payments/dashboard-transactions-search";
import { compact, formatDate, formatTokenAmount, formatUsd } from "./transaction-format";
import styles from "./transactions-page.module.css";

interface TransactionsTableProps {
  rows: DashboardTransaction[];
  search: DashboardTransactionSearch;
}

function transactionEvidence(row: DashboardTransaction) {
  if (!row.settlement) {
    return row.reportedTransactionId
      ? { label: "Unverified", value: compact(row.reportedTransactionId) }
      : { label: "Awaiting report", value: "—" };
  }
  if (row.settlement.verificationMethod === "simulated_test") {
    return { label: "Sandbox simulation", value: compact(row.settlement.particleTransactionId) };
  }
  return {
    label: "Verified",
    value: compact(row.settlement.txHash ?? row.settlement.particleTransactionId),
  };
}

function webhookState(row: DashboardTransaction) {
  if (!row.settlement) return { className: styles.neutral, label: "—" };
  if (!row.webhook) return { className: styles.neutral, label: "No delivery" };
  const states = {
    delivered: { className: styles.delivered, label: "✓ Delivered" },
    failed: { className: styles.webhookFailed, label: "! Failed" },
    gave_up: { className: styles.webhookFailed, label: "! Gave up" },
    pending: { className: styles.webhookPending, label: "◷ Pending" },
    retrying: { className: styles.webhookFailed, label: "! Failed · retrying" },
    timeout: { className: styles.webhookFailed, label: "! Timed out" },
  } as const;
  return states[row.webhook.result];
}

export function TransactionsTable({ rows, search }: TransactionsTableProps) {
  return (
    <section className={styles.card} aria-label="Payment ledger">
      <div className={styles.scrollArea}>
        <table className={styles.table}>
          <caption>Payments for the selected account mode</caption>
          <thead>
            <tr>
              <th scope="col">Amount</th>
              <th scope="col">Status</th>
              <th scope="col">Payer</th>
              <th scope="col">Transaction</th>
              <th scope="col">Webhook</th>
              <th className={styles.dateHeading} scope="col">
                Date
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const evidence = transactionEvidence(row);
              const webhook = webhookState(row);
              const isoDate = row.createdAt.toISOString();
              return (
                <tr key={row.paymentId}>
                  <td>
                    <div className={styles.amountCell}>
                      <div>
                        <strong>{formatUsd(row.amountUsd)}</strong>
                        <span>
                          {formatTokenAmount(row.amountUsd)} USDC ·{" "}
                          {chainDisplay(row.tokenChainId).label}
                        </span>
                      </div>
                      {row.env === "test" ? <span className={styles.testBadge}>TEST</span> : null}
                    </div>
                  </td>
                  <td>
                    <span className={`${styles.status} ${styles[row.status]}`}>
                      {row.status[0]?.toUpperCase()}
                      {row.status.slice(1)}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.payer} ${styles[row.payerType]}`}>
                      {row.payerType === "agent" ? <span aria-hidden="true" /> : null}
                      {row.payerType === "agent" ? "Agent" : "Human"}
                    </span>
                  </td>
                  <td>
                    <div className={styles.transactionCell}>
                      <Link
                        aria-label={`View details for ${row.refCode}`}
                        href={transactionsHref(search, { detail: row.paymentId })}
                      >
                        {evidence.value}
                      </Link>
                      <small>
                        {evidence.label} · {row.refCode}
                      </small>
                    </div>
                  </td>
                  <td>
                    <span className={`${styles.webhook} ${webhook.className}`}>
                      {webhook.label}
                    </span>
                  </td>
                  <td className={styles.dateCell}>
                    <time dateTime={isoDate} title={isoDate}>
                      {formatDate(row.createdAt)}
                    </time>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
