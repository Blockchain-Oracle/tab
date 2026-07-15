import type { DashboardTransaction } from "../../../../lib/payments/dashboard-transactions";
import styles from "./transactions-page.module.css";

interface TransactionsTableProps {
  hasMore: boolean;
  rows: DashboardTransaction[];
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
  timeZoneName: "short",
  year: "numeric",
});

function usd(value: string) {
  const [whole = "0", fraction = ""] = value.split(".");
  const micros = BigInt(whole) * BigInt(1_000_000) + BigInt(fraction.padEnd(6, "0").slice(0, 6));
  const cents = (micros + BigInt(5_000)) / BigInt(10_000);
  return `$${(cents / BigInt(100)).toLocaleString("en-US")}.${(cents % BigInt(100))
    .toString()
    .padStart(2, "0")}`;
}

function tokenAmount(value: string) {
  const [whole, fraction = ""] = value.split(".");
  const significant = fraction.replace(/0+$/, "");
  return significant ? `${whole}.${significant}` : `${whole}.00`;
}

function compact(value: string) {
  if (value.length <= 22) return value;
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

function transactionEvidence(row: DashboardTransaction) {
  if (!row.settlement) {
    return row.reportedTransactionId
      ? { label: "Unverified", value: compact(row.reportedTransactionId) }
      : { label: "Awaiting report", value: "—" };
  }
  if (row.settlement.verificationMethod === "simulated_test") {
    return { label: "Simulated test", value: compact(row.settlement.particleTransactionId) };
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

export function TransactionsTable({ hasMore, rows }: TransactionsTableProps) {
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
                        <strong>{usd(row.amountUsd)}</strong>
                        <span>{tokenAmount(row.amountUsd)} USDC · Arbitrum One</span>
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
                      <span>{evidence.value}</span>
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
                      {dateFormatter.format(row.createdAt)}
                    </time>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className={styles.footer}>
        {hasMore
          ? "Showing latest 20 payments"
          : `${rows.length} ${rows.length === 1 ? "payment" : "payments"}`}
      </footer>
    </section>
  );
}
