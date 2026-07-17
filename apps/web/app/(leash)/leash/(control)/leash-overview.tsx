import Link from "next/link";

import type { readOwnerLeashKey } from "../../../../lib/auth/leash-key";
import {
  blockedReceiptEvidence,
  type CapPolicyView,
  capUsageDescription,
} from "../../../../lib/leash/cap-view";
import {
  capFillWidth,
  formatBasisPoints,
  formatUsdAtomic,
  formatUsdCents,
} from "../../../../lib/leash/leash-format";
import type { OwnerAgent } from "../../../../lib/leash/owner-agents";
import styles from "./leash-overview.module.css";
import { type NotificationPreview, OverviewNotifications } from "./overview-notifications";

type KeySummary = Awaited<ReturnType<typeof readOwnerLeashKey>>;
type FloatRead = { balanceAtomic: string | null; label: string; network: string };
const statusCopy = {
  cancelled: "Cancelled — provisioning required",
  frozen: "Frozen",
  nuked: "Nuked — provisioning required",
  paused: "Paused",
  provisioned: "Active",
} as const;

function maskedKey(key: NonNullable<KeySummary>) {
  return `${key.prefix}••••••••${key.last4}`;
}

function floatTotal(reads: FloatRead[]) {
  if (reads.some((read) => read.balanceAtomic === null)) return null;
  return reads.reduce((total, read) => total + BigInt(read.balanceAtomic ?? "0"), BigInt(0));
}

export function LeashOverview({
  agent,
  floats,
  keySummary,
  notifications,
  policy,
  unreadCount,
}: {
  agent: OwnerAgent;
  floats: FloatRead[] | null;
  keySummary: KeySummary;
  notifications: NotificationPreview[];
  policy: CapPolicyView | null;
  unreadCount: number;
}) {
  const totalFloat = floats ? floatTotal(floats) : null;
  const query = `?agentId=${encodeURIComponent(agent.id)}`;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>COMMAND BRIDGE</p>
          <div className={styles.titleLine}>
            <h1>{agent.name}</h1>
            <span className={styles.statusChip}>{statusCopy[agent.status]}</span>
          </div>
        </div>
        <div className={styles.headerActions}>
          <Link href={`/leash/cap${query}`}>{policy ? "Adjust cap" : "Set cap"}</Link>
          <Link className={styles.secondaryAction} href={`/leash/connect${query}`}>
            Manage connection
          </Link>
        </div>
      </header>

      {!policy ? (
        <section className={styles.warning}>
          <div>
            <strong>Set a cap to enable payments.</strong>
            <p>The hosted signer currently refuses every payment for this agent.</p>
          </div>
          <Link href={`/leash/cap${query}`}>Set cap</Link>
        </section>
      ) : (
        <section className={styles.spendCard}>
          <div className={styles.cardHeading}>
            <span>SPEND THIS CYCLE</span>
            <Link href={`/leash/cap${query}`}>Cap &amp; limits →</Link>
          </div>
          <p className={styles.spendAmount}>
            <strong>{formatUsdAtomic(policy.spend.committedAtomic)}</strong>
            <span>/ {formatUsdCents(policy.cap.amountUsdCents)}</span>
            <b>{formatBasisPoints(policy.spend.committedBasisPoints ?? "0")}</b>
          </p>
          <div aria-label={capUsageDescription(policy)} className={styles.spendTrack} role="img">
            <span
              className={styles.settledFill}
              style={{ width: capFillWidth(policy.spend.settledFillBasisPoints ?? "0") }}
            />
            <span
              className={styles.pendingFill}
              style={{ width: capFillWidth(policy.spend.pendingFillBasisPoints ?? "0") }}
            />
            {BigInt(policy.spend.overageAtomic) > BigInt(0) ? (
              <span
                className={styles.overageFill}
                style={{ width: capFillWidth(policy.spend.overageFillBasisPoints ?? "0") }}
              />
            ) : null}
          </div>
          <div className={styles.spendMeta}>
            <span>
              {BigInt(policy.spend.pendingAtomic) > BigInt(0)
                ? `incl. ${formatUsdAtomic(policy.spend.pendingAtomic)} pending`
                : "No pending payments"}
            </span>
            <span>{policy.halted ? "Payments halted at the cap" : "Cap gate active"}</span>
            <span>{blockedReceiptEvidence(policy.spend.blockedReceiptCount)}</span>
          </div>
        </section>
      )}

      <section className={styles.cards}>
        <article>
          <span className={styles.cardLabel}>AGENT BALANCE</span>
          <strong>
            {!agent.agentAddress
              ? "Not provisioned"
              : totalFloat === null
                ? "Live read unavailable"
                : formatUsdAtomic(totalFloat.toString())}
          </strong>
          <p>{agent.agentAddress ? "Native USDC floats" : "No signing address exists"}</p>
          {floats ? (
            <ul className={styles.floatList}>
              {floats.map((read) => (
                <li key={read.network}>
                  <span>{read.label}</span>
                  <b>
                    {read.balanceAtomic === null
                      ? "Unavailable"
                      : formatUsdAtomic(read.balanceAtomic)}
                  </b>
                </li>
              ))}
            </ul>
          ) : null}
        </article>
        <article>
          <span className={styles.cardLabel}>CONNECTED AGENT</span>
          <strong>{agent.clientName ?? "No client connected"}</strong>
          <p>
            {agent.transport ?? "Connection metadata appears after the first real initialize call."}
          </p>
          <small>
            {agent.connectionCount} recorded connection{agent.connectionCount === 1 ? "" : "s"}
          </small>
        </article>
        <article>
          <span className={styles.cardLabel}>LEASH KEY</span>
          <strong>{keySummary ? "Active" : "Not issued"}</strong>
          <p className={styles.mono}>
            {keySummary ? maskedKey(keySummary) : "No key material exists"}
          </p>
          <small>
            {keySummary
              ? "Hash stored at rest · reveal unavailable"
              : "Generate it once in Connect agent"}
          </small>
        </article>
      </section>

      <OverviewNotifications
        agentId={agent.id}
        notifications={notifications}
        unreadCount={unreadCount}
      />
    </main>
  );
}
