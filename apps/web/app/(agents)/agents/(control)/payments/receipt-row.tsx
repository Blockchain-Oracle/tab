import Link from "next/link";

import type { ReceiptItem } from "../receipt-client";
import styles from "./receipt-row.module.css";

const statusCopy = {
  blocked: "Blocked",
  failed: "Failed",
  pending: "Pending",
  settled: "Settled",
};

const FLOW_STAGES = ["402", "Policy", "Sign", "Settle"] as const;

/**
 * Truthful per-stage states derived from the receipt status: a receipt only
 * exists after a 402 was observed; `blocked` stopped at policy before any
 * signature; `pending` has provably passed 402/policy/sign and awaits
 * settlement; `settled`/`failed` resolve the last node.
 */
function flowStates(status: ReceiptItem["status"]) {
  switch (status) {
    case "blocked":
      return ["done", "stop", "todo", "todo"] as const;
    case "pending":
      return ["done", "done", "done", "inflight"] as const;
    case "settled":
      return ["done", "done", "done", "settled"] as const;
    case "failed":
      return ["done", "done", "done", "failed"] as const;
  }
}

function ReceiptFlowline({ animate, status }: { animate: boolean; status: ReceiptItem["status"] }) {
  const states = flowStates(status);
  return (
    <div aria-hidden="true" className={styles.flowline} data-animate={animate ? "" : undefined}>
      {FLOW_STAGES.map((label, index) => (
        <span className={styles.flowStage} data-state={states[index]} key={label}>
          <span className={styles.flowBar} style={{ animationDelay: `${index * 90}ms` }} />
          <span className={styles.flowLabel}>{label}</span>
        </span>
      ))}
    </div>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    second: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

function shortHash(value: string) {
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

export function ReceiptRow({
  agentId,
  isNewest = false,
  receipt,
}: {
  agentId: string;
  isNewest?: boolean;
  receipt: ReceiptItem;
}) {
  const query = new URLSearchParams({ agentId }).toString();
  const detailHref = `/agents/receipts/${receipt.id}?${query}`;
  const explorer =
    (receipt.status === "settled" || receipt.status === "failed") && receipt.txHash
      ? receipt.explorer
      : null;
  const resource = receipt.resourceUrl ?? receipt.resourceHost ?? "Resource unavailable";
  return (
    <li className={`${styles.item} ${isNewest ? styles.newest : ""}`}>
      <div className={styles.row}>
        <strong className={styles.amount}>{receipt.amountDisplay}</strong>
        <Link className={styles.resource} href={detailHref}>
          <strong>{resource}</strong>
          <small>View receipt →</small>
        </Link>
        <span className={styles[receipt.status]}>{statusCopy[receipt.status]}</span>
        <span className={receipt.network.target ? styles.target : styles.network}>
          {receipt.network.label}
          {receipt.network.target ? " (target)" : ""}
          {receipt.network.testFunds ? ` · ${receipt.network.testFundsLabel}` : ""}
        </span>
        <div className={styles.transaction}>
          {explorer && receipt.txHash ? (
            <a
              aria-label={`${explorer.label}: transaction ${receipt.txHash}`}
              href={explorer.href}
              rel="noreferrer"
              target="_blank"
              title={receipt.txHash}
            >
              <code>{shortHash(receipt.txHash)}</code>
            </a>
          ) : (
            <span title="No on-chain transaction">—</span>
          )}
        </div>
        <time className={styles.time} dateTime={receipt.createdAt}>
          {formatTime(receipt.createdAt)} UTC
        </time>
      </div>
      <ReceiptFlowline animate={isNewest} status={receipt.status} />
    </li>
  );
}
