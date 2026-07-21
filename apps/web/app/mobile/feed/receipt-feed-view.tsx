"use client";

import Link from "next/link";

import type { ReceiptFeedState, ReceiptItem } from "../../(agents)/agents/(control)/receipt-client";
import styles from "./receipt-feed.module.css";

const statusCopy: Record<ReceiptItem["status"], string> = {
  blocked: "Blocked",
  failed: "Failed",
  pending: "Pending",
  settled: "Settled",
};

const TEST_FUNDS_LABEL = "Sandbox funds — no real value";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function shortHash(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function MobileReceiptRow({ agentId, receipt }: { agentId: string; receipt: ReceiptItem }) {
  const query = new URLSearchParams({ agentId });
  const resource = receipt.resourceHost ?? receipt.resourceUrl ?? "Resource unavailable";
  const explorer =
    (receipt.status === "settled" || receipt.status === "failed") && receipt.txHash
      ? receipt.explorer
      : null;
  const testFundsLabel = receipt.network.testFunds
    ? (receipt.network.testFundsLabel ?? TEST_FUNDS_LABEL)
    : null;

  return (
    <li className={styles.item}>
      <Link
        className={styles.receiptLink}
        href={`/mobile/receipts/${encodeURIComponent(receipt.id)}?${query}`}
      >
        <span className={styles.rowTop}>
          <strong className={styles.amount}>{receipt.amountDisplay}</strong>
          <span className={`${styles.status} ${styles[receipt.status]}`}>
            {statusCopy[receipt.status]}
          </span>
        </span>
        <strong className={styles.resource}>{resource}</strong>
        <span className={styles.meta}>
          <span>{receipt.network.label}</span>
          <time dateTime={receipt.createdAt}>{formatTime(receipt.createdAt)} UTC</time>
        </span>
        {testFundsLabel ? <span className={styles.testFunds}>{testFundsLabel}</span> : null}
        {receipt.status === "blocked" ? (
          <span className={styles.policyNote}>Stopped before signing. Nothing was sent.</span>
        ) : null}
      </Link>
      {explorer && receipt.txHash ? (
        <a
          aria-label={`${explorer.label}: transaction ${receipt.txHash}`}
          className={styles.explorer}
          href={explorer.href}
          rel="noreferrer"
          target="_blank"
        >
          <code>{shortHash(receipt.txHash)}</code>
          <span>{explorer.label} ↗</span>
        </a>
      ) : null}
    </li>
  );
}

export function MobileReceiptFeedView({
  agentId,
  onRetry,
  state,
}: {
  agentId: string;
  onRetry?: () => void;
  state: ReceiptFeedState;
}) {
  const health = {
    connecting: "Connecting",
    live: "Live",
    retrying: "Retrying",
  }[state.connection];
  const loading = state.connection === "connecting" && state.lastSuccessfulPollAt === null;

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>ACTIVITY</p>
          <h1>Payment receipts</h1>
          <span>Real x402 attempts, newest first.</span>
        </div>
        <strong
          aria-atomic="true"
          aria-live="polite"
          className={`${styles.health} ${styles[state.connection]}`}
          role="status"
        >
          <i aria-hidden="true" />
          {health}
        </strong>
      </header>

      {state.error ? (
        <div className={styles.error} role="alert">
          <strong>Showing the last loaded receipts</strong>
          <span>{state.error}</span>
          {onRetry ? (
            <button onClick={onRetry} type="button">
              Retry now
            </button>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div aria-live="polite" className={styles.empty}>
          <h2>Loading payment receipts</h2>
          <p>Checking the owner-scoped ledger.</p>
        </div>
      ) : state.result.receipts.length === 0 ? (
        <div className={styles.empty}>
          <h2>No payments yet</h2>
          <p>This agent has no x402 receipts yet.</p>
        </div>
      ) : (
        <ol aria-label="Payment receipts" className={styles.list}>
          {state.result.receipts.map((receipt) => (
            <MobileReceiptRow agentId={agentId} key={receipt.id} receipt={receipt} />
          ))}
        </ol>
      )}
    </section>
  );
}
