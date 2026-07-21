import Link from "next/link";
import { CodeBlock } from "../../../../components/code-block";
import { chainDisplay } from "../../../../lib/payments/chain-display";
import type { DashboardTransaction } from "../../../../lib/payments/dashboard-transactions";
import {
  type DashboardTransactionSearch,
  transactionsHref,
} from "../../../../lib/payments/dashboard-transactions-search";
import styles from "./transaction-detail.module.css";
import { formatTokenAmount, formatUsd } from "./transaction-format";

interface TransactionDetailProps {
  row: DashboardTransaction;
  search: DashboardTransactionSearch;
}

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

function displayValue(value: unknown) {
  if (typeof value === "string") return value;
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function structuredChanges(changes: unknown[]) {
  if (changes.length === 0) return <p className={styles.muted}>No token changes recorded.</p>;
  const seen = new Map<string, number>();
  return changes.map((change) => {
    const serialized = JSON.stringify(change);
    const occurrence = (seen.get(serialized) ?? 0) + 1;
    seen.set(serialized, occurrence);
    const fields: [string, unknown][] =
      change && typeof change === "object" && !Array.isArray(change)
        ? Object.entries(change as Record<string, unknown>)
        : [["value", change]];
    return (
      <div className={styles.changeCard} key={`${serialized}:${occurrence}`}>
        {fields.map(([key, value]) => (
          <div className={styles.changeRow} key={key}>
            <span>{key}</span>
            <code>{displayValue(value)}</code>
          </div>
        ))}
      </div>
    );
  });
}

function webhookLabel(row: DashboardTransaction) {
  if (!row.webhook) return "No delivery recorded";
  const labels = {
    delivered: "Delivered",
    failed: "Failed",
    gave_up: "Gave up",
    pending: "Pending",
    retrying: "Failed · retrying",
    timeout: "Timed out",
  } as const;
  const parts = [labels[row.webhook.result], `attempt ${row.webhook.attempt} of 3`];
  if (row.webhook.statusCode) parts.push(`HTTP ${row.webhook.statusCode}`);
  if (row.webhook.responseTimeMs !== null) parts.push(`${row.webhook.responseTimeMs}ms`);
  return parts.join(" · ");
}

function EvidenceField({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.evidenceField}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function TransactionDetail({ row, search }: TransactionDetailProps) {
  const closeHref = transactionsHref(search, { detail: null });
  const realHash =
    row.settlement?.txHash && TX_HASH.test(row.settlement.txHash) ? row.settlement.txHash : null;
  const changes = row.settlement?.tokenChanges ?? row.reportedTokenChanges ?? [];
  const changesLabel = row.settlement
    ? "Verified tokenChanges"
    : row.reportedTokenChanges
      ? "Reported tokenChanges — unverified"
      : "tokenChanges";

  return (
    <div className={styles.layer}>
      <Link aria-label="Close transaction details" className={styles.backdrop} href={closeHref} />
      <aside
        aria-labelledby="transaction-detail-title"
        aria-modal="true"
        className={styles.panel}
        role="dialog"
      >
        <header className={styles.header}>
          <div>
            <div className={styles.titleLine}>
              <h2 id="transaction-detail-title">{formatUsd(row.amountUsd)}</h2>
              <span className={`${styles.status} ${styles[row.status]}`}>{row.status}</span>
              {row.env === "test" ? <span className={styles.testBadge}>TESTNET</span> : null}
            </div>
            <p>{row.refCode}</p>
          </div>
          <Link aria-label="Close transaction details" className={styles.close} href={closeHref}>
            ×
          </Link>
        </header>

        <div className={styles.body}>
          {row.env === "test" ? (
            <p className={styles.testNotice}>Sandbox settlement — simulated, no funds moved.</p>
          ) : null}

          <section>
            <h3>Transaction evidence</h3>
            <code className={styles.fullValue}>
              {row.settlement?.particleTransactionId ?? row.reportedTransactionId ?? "Not reported"}
            </code>
            {row.env === "live" && row.settlement?.particleTransactionId ? (
              <a
                href={`https://universalx.app/activity/details?id=${encodeURIComponent(row.settlement.particleTransactionId)}`}
                rel="noreferrer"
                target="_blank"
              >
                View on UniversalX activity ↗
              </a>
            ) : null}
            {realHash ? (
              <>
                <code className={styles.fullValue}>{realHash}</code>
                {chainDisplay(row.tokenChainId).explorerTxUrl ? (
                  <a
                    href={chainDisplay(row.tokenChainId).explorerTxUrl?.(realHash)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    View on {chainDisplay(row.tokenChainId).label} explorer ↗
                  </a>
                ) : null}
              </>
            ) : null}
          </section>

          <dl className={styles.evidenceGrid}>
            <EvidenceField label="PAYMENT ID" value={row.paymentId} />
            <EvidenceField
              label="AMOUNT"
              value={`${formatUsd(row.amountUsd)} · ${formatTokenAmount(row.amountUsd)} USDC`}
            />
            <EvidenceField label="STATUS" value={row.status} />
            <EvidenceField label="PAYER TYPE" value={row.payerType} />
            <EvidenceField label="PAYER ADDRESS" value={row.payerAddress ?? "Not reported"} />
            <EvidenceField label="RECEIVER" value={row.receiver} />
            <EvidenceField label="CHAIN ID" value={String(row.tokenChainId)} />
            <EvidenceField label="TOKEN ADDRESS" value={row.tokenAddress} />
            <EvidenceField label="CREATED" value={row.createdAt.toISOString()} />
            <EvidenceField
              label="REPORTED"
              value={row.reportedAt?.toISOString() ?? "Not reported"}
            />
            <EvidenceField label="SETTLED" value={row.settledAt?.toISOString() ?? "Not settled"} />
            <EvidenceField
              label="SETTLEMENT ID"
              value={row.settlement?.id ?? "No verified settlement"}
            />
            <EvidenceField
              label="AMOUNT ATOMIC"
              value={row.settlement?.amountAtomic ?? "No verified settlement"}
            />
            <EvidenceField
              label="VERIFIED"
              value={row.settlement?.verifiedAt.toISOString() ?? "Not verified"}
            />
            <EvidenceField
              label="VERIFICATION"
              value={
                row.settlement
                  ? `${row.settlement.verificationMethod} · ${row.settlement.verificationTrigger}`
                  : "No verified settlement"
              }
            />
            {row.failureReason ? (
              <EvidenceField label="FAILURE REASON" value={row.failureReason} />
            ) : null}
          </dl>

          <section>
            <h3>{changesLabel}</h3>
            <div className={styles.changes}>{structuredChanges(changes)}</div>
            <details className={styles.rawJson}>
              <summary>View raw JSON</summary>
              <CodeBlock code={JSON.stringify(changes, null, 2)} lang="json" />
            </details>
          </section>

          <section>
            <h3>Webhook delivery</h3>
            <p className={styles.webhook}>{webhookLabel(row)}</p>
            {row.webhook ? (
              <code className={styles.fullValue}>
                {row.webhook.id}
                {row.webhook.completedAt
                  ? ` · completed ${row.webhook.completedAt.toISOString()}`
                  : row.webhook.nextRetryAt
                    ? ` · next retry ${row.webhook.nextRetryAt.toISOString()}`
                    : ""}
              </code>
            ) : null}
          </section>

          <section>
            <h3>Intent endpoint</h3>
            <code className={styles.fullValue}>{row.intentUrl}</code>
          </section>
        </div>
      </aside>
    </div>
  );
}
