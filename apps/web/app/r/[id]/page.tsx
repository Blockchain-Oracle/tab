/** biome-ignore-all lint/a11y/noSvgWithoutTitle: decorative aria-hidden tally marks; accessible labels live on the surrounding elements. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getServerDatabase } from "../../../lib/db/server";
import { formatTimestamp } from "../../../lib/format/timestamp";
import { truncateHash } from "../../../lib/format/truncate-hash";
import { formatShareAmount, readShareableReceipt } from "../../../lib/receipts/share-card";
import styles from "./share.module.css";

// Settled receipts are immutable — cache each share page after first render.
export const revalidate = 3600;

type SharePageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  const { id } = await params;
  const receipt = await readShareableReceipt(getServerDatabase().db, id);
  if (!receipt) return { title: "Receipt" };
  return {
    description: `${formatShareAmount(receipt.amountUsd)} settled on ${receipt.networkName}. Paid by an AI agent via x402 — verified on-chain.`,
    title: `Receipt · ${formatShareAmount(receipt.amountUsd)}`,
  };
}

/**
 * The public receipt artifact: settled evidence anyone with the link can
 * verify. Anonymous by design — the card shows the money truth, never the
 * owner or agent behind it.
 */
export default async function SharePage({ params }: SharePageProps) {
  const { id } = await params;
  const receipt = await readShareableReceipt(getServerDatabase().db, id);
  if (!receipt) notFound();

  return (
    <main className={styles.canvas}>
      <article aria-label="Settled payment receipt" className={styles.receipt}>
        {receipt.testFunds ? (
          <p className={styles.testBanner}>Testnet · {receipt.networkName}</p>
        ) : null}

        <header className={styles.head}>
          <span aria-hidden="true" className={styles.tally}>
            <svg viewBox="0 0 24 24">
              <g stroke="currentColor" strokeLinecap="round" strokeWidth="2.2">
                <path d="M5 5v14" />
                <path d="M10 5v14" />
                <path d="M15 5v14" />
                <path d="M20 5v14" />
              </g>
              <path d="M2 17 22 7" stroke="#e8501f" strokeLinecap="round" strokeWidth="2.4" />
            </svg>
          </span>
          <span className={styles.badge}>402 → 200</span>
        </header>

        <p className={styles.amount}>{formatShareAmount(receipt.amountUsd)}</p>
        <p className={styles.subtitle}>
          Paid by an AI agent via x402
          {receipt.resourceHost ? (
            <>
              {" to "}
              <strong>{receipt.resourceHost}</strong>
            </>
          ) : null}
        </p>

        <dl className={styles.evidence}>
          <div>
            <dt>Network</dt>
            <dd>{receipt.networkName}</dd>
          </div>
          <div>
            <dt>Settled</dt>
            <dd>
              <time dateTime={receipt.settledAt.toISOString()}>
                {formatTimestamp(receipt.settledAt).absoluteUtc}
              </time>
            </dd>
          </div>
          <div>
            <dt>Transaction</dt>
            <dd>
              {receipt.explorerTxUrl ? (
                <a href={receipt.explorerTxUrl} rel="noreferrer" target="_blank">
                  <code>{truncateHash(receipt.txHash, 10, 8)}</code> ↗
                </a>
              ) : (
                <code>{truncateHash(receipt.txHash, 10, 8)}</code>
              )}
            </dd>
          </div>
        </dl>

        <div className={styles.stampRow}>
          <span className={styles.stamp}>Settled</span>
          <span className={styles.stampNote}>Verified on-chain — check the hash yourself.</span>
        </div>

        <footer className={styles.foot}>
          <span>Tab · invisible payments — for you, and for your AI</span>
        </footer>
      </article>
    </main>
  );
}
