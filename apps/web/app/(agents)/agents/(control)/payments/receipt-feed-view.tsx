import type { CapResetNotice } from "../../../../../lib/leash/cap-reset-notice";
import type { CapPolicyView } from "../../../../../lib/leash/cap-view";
import type { ReceiptFeedState } from "../receipt-client";
import { PaymentCapStatus } from "./payment-cap-status";
import styles from "./receipt-feed.module.css";
import { ReceiptRow } from "./receipt-row";

const resetCopy: Record<CapResetNotice["reason"], string> = {
  frequency_change: "Reset after a frequency change",
  manual: "Reset manually",
  schedule: "Reset on schedule",
};

function formatResetAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    timeZoneName: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatHealthTime(value: number) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

export function ReceiptFeedView({
  agentId,
  capResetNotice,
  onRetry,
  policy = null,
  state,
}: {
  agentId: string;
  capResetNotice: CapResetNotice | null;
  onRetry?: () => void;
  policy?: CapPolicyView | null;
  state: ReceiptFeedState;
}) {
  const connectionCopy = {
    connecting: "Connecting",
    live: "Live",
    retrying: "Updates paused",
  }[state.connection];
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>AUTOMATED SPEND LEDGER</p>
          <h1>Payment receipts</h1>
          <span>Real x402 attempts, newest first.</span>
        </div>
        <div className={styles.health}>
          <b
            aria-atomic="true"
            aria-live="polite"
            className={styles[state.connection]}
            role="status"
          >
            <i aria-hidden="true" />
            {connectionCopy}
          </b>
          {state.lastSuccessfulPollAt !== null ? (
            <small>
              Last success{" "}
              <time dateTime={new Date(state.lastSuccessfulPollAt).toISOString()}>
                {formatHealthTime(state.lastSuccessfulPollAt)}
              </time>
            </small>
          ) : null}
        </div>
      </header>

      <PaymentCapStatus agentId={agentId} policy={policy} />

      {capResetNotice ? (
        <section aria-label="Cap cycle reset" className={styles.reset}>
          <b>CYCLE RESET</b>
          <span>
            {resetCopy[capResetNotice.reason]} at{" "}
            <time dateTime={capResetNotice.resetAt}>{formatResetAt(capResetNotice.resetAt)}</time>.
            This cycle’s spend counts from that boundary.
          </span>
        </section>
      ) : null}
      {state.error ? (
        <section className={styles.error} role="alert">
          <p>{state.error}</p>
          {onRetry ? (
            <button onClick={onRetry} type="button">
              Retry now
            </button>
          ) : null}
        </section>
      ) : null}
      {state.connection === "connecting" && state.lastSuccessfulPollAt === null ? (
        <section className={styles.empty} aria-live="polite">
          <h2>Loading payment receipts…</h2>
          <p>Checking the owner-scoped ledger.</p>
        </section>
      ) : state.result.receipts.length === 0 ? (
        <section className={styles.empty}>
          <h2>No payment receipts yet</h2>
          <p>Real x402 attempts appear here after this agent reaches a paid resource.</p>
        </section>
      ) : (
        <>
          <div aria-hidden="true" className={styles.tableHeading}>
            <span>AMOUNT</span>
            <span>RESOURCE</span>
            <span>STATUS</span>
            <span>NETWORK</span>
            <span>TX HASH</span>
            <span>TIME</span>
          </div>
          <ol aria-label="Payment receipts" className={styles.list}>
            {state.result.receipts.map((receipt, index) => (
              <ReceiptRow
                agentId={agentId}
                isNewest={index === 0}
                key={receipt.id}
                receipt={receipt}
              />
            ))}
          </ol>
        </>
      )}
    </main>
  );
}
