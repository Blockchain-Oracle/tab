"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import type { ReceiptItem } from "../../receipt-client";
import { ReceiptCapContext } from "./receipt-cap-context";
import { ReceiptCopyButton } from "./receipt-copy-button";
import styles from "./receipt-detail.module.css";

const statusCopy = { blocked: "Blocked", failed: "Failed", pending: "Pending", settled: "Settled" };

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function EvidenceValue({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return <dd className={mono ? styles.mono : undefined}>{children}</dd>;
}

export function ReceiptDetailView({
  backAgentId,
  error,
  loading,
  receipt,
}: {
  backAgentId: string | null;
  error: string | null;
  loading: boolean;
  receipt: ReceiptItem | null;
}) {
  const backQuery = backAgentId ? `?${new URLSearchParams({ agentId: backAgentId })}` : "";
  if (loading && !receipt) {
    return (
      <main className={styles.page}>
        <p className={styles.loading}>Loading receipt evidence…</p>
      </main>
    );
  }
  if (!receipt) {
    return (
      <main className={styles.page}>
        <Link className={styles.back} href={`/leash/payments${backQuery}`}>
          ← Payment receipts
        </Link>
        <section className={styles.unavailable} role="alert">
          <h1>Receipt could not be loaded</h1>
          <p>{error ?? "No receipt evidence is available for this route."}</p>
        </section>
      </main>
    );
  }

  const resource = receipt.resourceUrl ?? receipt.resourceHost ?? "Resource unavailable";
  const resourceIsLink = resource.startsWith("https://") || resource.startsWith("http://");
  const transactionExplorer =
    receipt.status === "settled" || receipt.status === "failed" ? receipt.explorer : null;
  return (
    <main className={styles.page}>
      <Link className={styles.back} href={`/leash/payments${backQuery}`}>
        ← Payment receipts
      </Link>
      <header className={styles.header}>
        <div>
          <p>RECEIPT EVIDENCE</p>
          <h1>
            {receipt.amountDisplay} <span>{receipt.asset}</span>
          </h1>
        </div>
        <b className={styles[receipt.status]}>{statusCopy[receipt.status]}</b>
      </header>
      {error ? (
        <p className={styles.error} role="alert">
          {error} Showing the last successful snapshot.
        </p>
      ) : null}
      <section className={styles.summary}>
        <dl>
          <div>
            <dt>Amount</dt>
            <EvidenceValue>{receipt.amountDisplay}</EvidenceValue>
          </div>
          <div>
            <dt>Raw amount</dt>
            <EvidenceValue mono>
              {receipt.amountAtomic} atomic units · {receipt.amountUsd} USDC (6 decimals)
            </EvidenceValue>
          </div>
          <div>
            <dt>Asset</dt>
            <EvidenceValue>{receipt.asset}</EvidenceValue>
          </div>
          <div>
            <dt>Resource</dt>
            <EvidenceValue mono>
              <span className={styles.evidenceLine}>
                {resourceIsLink ? (
                  <a href={resource} rel="noreferrer" target="_blank">
                    {resource}
                  </a>
                ) : (
                  resource
                )}
                {receipt.resourceUrl ? (
                  <ReceiptCopyButton label="Copy resource URL" value={receipt.resourceUrl} />
                ) : null}
              </span>
            </EvidenceValue>
          </div>
          <div>
            <dt>Network</dt>
            <EvidenceValue>
              {receipt.network.label} · <span className={styles.mono}>{receipt.network.id}</span>
              {receipt.network.target ? " (target)" : ""}
            </EvidenceValue>
          </div>
          <div>
            <dt>Attempted</dt>
            <EvidenceValue>{formatTime(receipt.createdAt)} UTC</EvidenceValue>
          </div>
          <div>
            <dt>Settled</dt>
            <EvidenceValue>
              {receipt.settledAt ? `${formatTime(receipt.settledAt)} UTC` : "Not settled"}
            </EvidenceValue>
          </div>
          <div>
            <dt>Pay to</dt>
            <EvidenceValue mono>
              <span className={styles.evidenceLine}>
                <span>{receipt.payTo}</span>
                <ReceiptCopyButton label="Copy pay-to address" value={receipt.payTo} />
              </span>
            </EvidenceValue>
          </div>
          {receipt.reason ? (
            <div>
              <dt>Reason</dt>
              <EvidenceValue mono>{receipt.reason}</EvidenceValue>
            </div>
          ) : null}
        </dl>
      </section>
      <ReceiptCapContext receipt={receipt} />
      <div className={styles.evidenceGrid}>
        <section className={styles.evidenceCard}>
          <p>ORIGIN</p>
          {receipt.origin ? (
            <dl>
              <div>
                <dt>Transport</dt>
                <dd>{receipt.origin.transport.toUpperCase()}</dd>
              </div>
              {receipt.origin.clientName ? (
                <div>
                  <dt>Client</dt>
                  <dd>{receipt.origin.clientName}</dd>
                </div>
              ) : null}
              {receipt.origin.toolName ? (
                <div>
                  <dt>Tool</dt>
                  <dd className={styles.mono}>{receipt.origin.toolName}</dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <span className={styles.evidenceUnavailable}>
              Origin metadata is unavailable for this receipt.
            </span>
          )}
        </section>
        <section className={styles.evidenceCard}>
          <p>SETTLEMENT</p>
          {transactionExplorer && receipt.txHash ? (
            <div className={styles.evidenceLine}>
              <code>{receipt.txHash}</code>
              <ReceiptCopyButton label="Copy transaction hash" value={receipt.txHash} />
            </div>
          ) : (
            <span className={styles.evidenceUnavailable}>
              {receipt.status === "pending"
                ? "Awaiting a payment result."
                : "No settled transaction exists for this receipt."}
            </span>
          )}
          {transactionExplorer && receipt.txHash ? (
            <a href={transactionExplorer.href} rel="noreferrer" target="_blank">
              {transactionExplorer.label} ↗
            </a>
          ) : null}
        </section>
      </div>
    </main>
  );
}
