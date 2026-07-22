"use client";

import Link from "next/link";
import { EvidenceCopyButton } from "../../../(agents)/agents/(control)/evidence-copy-button";
import type { ReceiptItem } from "../../../(agents)/agents/(control)/receipt-client";
import styles from "./receipt-detail.module.css";

export type MobileReceipt = ReceiptItem;

const statusCopy: Record<MobileReceipt["status"], string> = {
  blocked: "Blocked",
  failed: "Failed",
  pending: "Pending",
  settled: "Settled",
};

const explorerOrigins: Record<string, string> = {
  "eip155:8453": "https://basescan.org",
  "eip155:84532": "https://sepolia.basescan.org",
  "eip155:42161": "https://arbiscan.io",
};

function validTransactionEvidence(receipt: MobileReceipt) {
  if (receipt.status === "blocked" || !receipt.explorer || !receipt.txHash) return null;
  if (!/^0x[0-9a-fA-F]{64}$/.test(receipt.txHash)) return null;
  const allowedOrigin = receipt.network.id ? explorerOrigins[receipt.network.id] : undefined;
  if (!allowedOrigin) return null;
  try {
    const explorer = new URL(receipt.explorer.href);
    if (explorer.origin !== allowedOrigin) return null;
    if (explorer.pathname.toLowerCase() !== `/tx/${receipt.txHash.toLowerCase()}`) return null;
  } catch {
    return null;
  }
  return { ...receipt.explorer, txHash: receipt.txHash };
}

function networkLabel(receipt: MobileReceipt) {
  return `${receipt.network.label}${receipt.network.target ? " (target)" : ""}`;
}

function originLabel(origin: NonNullable<MobileReceipt["origin"]>) {
  return [origin.clientName, origin.toolName, origin.transport.toUpperCase()]
    .filter(Boolean)
    .join(" · ");
}

/** The anonymous share-card URL — settled evidence only, no owner context. */
function shareUrl(id: string) {
  if (typeof window === "undefined") return `/r/${id}`;
  return new URL(`/r/${id}`, window.location.origin).toString();
}

export function MobileReceiptDetail({ receipt }: { receipt: MobileReceipt }) {
  const evidence = validTransactionEvidence(receipt);
  const resource = receipt.resourceUrl ?? receipt.resourceHost;
  const testFundsLabel = receipt.network.testFunds
    ? (receipt.network.testFundsLabel ?? "Testnet")
    : null;

  return (
    <main className={styles.page}>
      <Link className={styles.back} href="/mobile/feed">
        ← Payment receipts
      </Link>

      <header className={styles.header}>
        <div>
          <p>RECEIPT EVIDENCE</p>
          <h1>{receipt.amountDisplay}</h1>
        </div>
        <strong className={`${styles.status} ${styles[receipt.status]}`}>
          {statusCopy[receipt.status]}
        </strong>
      </header>

      {testFundsLabel ? <p className={styles.testFunds}>{testFundsLabel}</p> : null}
      {receipt.status === "blocked" ? (
        <p className={styles.blockedNote}>This payment was not submitted.</p>
      ) : null}

      <section className={styles.summary} aria-label="Payment evidence">
        <dl>
          <div>
            <dt>Amount</dt>
            <dd>{receipt.amountDisplay}</dd>
          </div>
          <div>
            <dt>Raw amount</dt>
            <dd className={styles.mono}>
              {receipt.amountAtomic} atomic units · {receipt.amountUsd} {receipt.asset}
            </dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd>
              {networkLabel(receipt)} · <span className={styles.mono}>{receipt.network.id}</span>
            </dd>
          </div>
          <div>
            <dt>Payee</dt>
            <dd className={styles.copyLine}>
              <span className={styles.mono}>{receipt.payTo}</span>
              <EvidenceCopyButton label="Copy payee" value={receipt.payTo} />
            </dd>
          </div>
          <div>
            <dt>Authorization</dt>
            <dd className={styles.mono}>
              {receipt.authorizationNonce.slice(0, 12)}… · expires{" "}
              {new Date(receipt.authorizationValidBefore).toISOString().slice(0, 16)} UTC
            </dd>
          </div>
          {receipt.reason ? (
            <div>
              <dt>Reason</dt>
              <dd className={styles.mono}>{receipt.reason}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className={styles.evidenceGrid}>
        <article className={styles.evidenceCard}>
          <h2>Resource</h2>
          {resource ? (
            <div className={styles.copyLine}>
              <span className={styles.break}>{resource}</span>
              <EvidenceCopyButton label="Copy resource" value={resource} />
            </div>
          ) : (
            <p>Resource was not recorded for this receipt.</p>
          )}
        </article>

        <article className={styles.evidenceCard}>
          <h2>Origin</h2>
          {receipt.origin ? (
            <div className={styles.copyLine}>
              <span>
                {receipt.origin.clientName ? <b>{receipt.origin.clientName}</b> : null}
                {receipt.origin.toolName ? <code>{receipt.origin.toolName}</code> : null}
                <span>{receipt.origin.transport.toUpperCase()}</span>
              </span>
              <EvidenceCopyButton label="Copy origin" value={originLabel(receipt.origin)} />
            </div>
          ) : (
            <p>Origin metadata was not recorded for this receipt.</p>
          )}
        </article>

        <article className={`${styles.evidenceCard} ${styles.settlement}`}>
          <h2>Settlement</h2>
          {evidence ? (
            <>
              <div className={styles.copyLine}>
                <code className={styles.break}>{evidence.txHash}</code>
                <EvidenceCopyButton label="Copy transaction hash" value={evidence.txHash} />
              </div>
              <a href={evidence.href} rel="noreferrer" target="_blank">
                {evidence.label} ↗
              </a>
              {receipt.status === "settled" ? (
                <div className={styles.copyLine}>
                  <span className={styles.mono}>{`/r/${receipt.id}`}</span>
                  <EvidenceCopyButton label="Copy public share link" value={shareUrl(receipt.id)} />
                </div>
              ) : null}
            </>
          ) : (
            <p>
              {receipt.status === "pending"
                ? "Awaiting settlement evidence."
                : "No valid transaction evidence is available."}
            </p>
          )}
        </article>
      </section>
    </main>
  );
}
