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
import { BASE_SEPOLIA_INTEGRATION_PROFILE } from "../../../../lib/leash/payment-profile";
import type { listOwnerReceipts } from "../../../../lib/leash/receipt-store";
import { TEST_FUNDS_LABEL } from "../../../../lib/leash/test-funds";
import { CycleResetLine } from "./cycle-reset-line";
import { classifyFloatHealth } from "./float-health";
import styles from "./leash-overview.module.css";
import { OverviewCards } from "./overview-cards";
import { OverviewLiveHealth } from "./overview-live-health";
import { type NotificationPreview, OverviewNotifications } from "./overview-notifications";
import { OverviewReceipts } from "./overview-receipts";
import { OverviewActions, OverviewStateNotices } from "./overview-state";

type KeySummary = Awaited<ReturnType<typeof readOwnerLeashKey>>;
type ReceiptPreview = Awaited<ReturnType<typeof listOwnerReceipts>>["receipts"][number];
type FloatRead = { balanceAtomic: string | null; label: string; network: string };
const statusCopy = {
  cancelled: "Cancelled — provisioning required",
  frozen: "Frozen",
  nuked: "Not provisioned — credential destroyed",
  paused: "Paused",
  provisioned: "Active",
} as const;
const statusClass = {
  cancelled: styles.cancelledStatus,
  frozen: styles.frozenStatus,
  nuked: styles.nukedStatus,
  paused: styles.pausedStatus,
  provisioned: styles.activeStatus,
} as const;

export function LeashOverview({
  agent,
  floats,
  keySummary,
  notifications,
  policy,
  receipts,
  unreadCount,
}: {
  agent: OwnerAgent;
  floats: FloatRead[] | null;
  keySummary: KeySummary;
  notifications: NotificationPreview[];
  policy: CapPolicyView | null;
  receipts: ReceiptPreview[];
  unreadCount: number;
}) {
  const floatHealth = classifyFloatHealth(floats, agent.agentAddress !== null);
  const query = `?agentId=${encodeURIComponent(agent.id)}`;
  const terminal = agent.status === "cancelled" || agent.status === "nuked";
  const halted = !terminal && policy?.halted === true;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>COMMAND BRIDGE</p>
          <div className={styles.titleLine}>
            <h1>{agent.name}</h1>
            <span
              className={`${styles.statusChip} ${halted ? styles.haltedStatus : statusClass[agent.status]}`}
            >
              {halted ? "Halted — cap reached" : statusCopy[agent.status]}
            </span>
            {agent.paymentProfile === BASE_SEPOLIA_INTEGRATION_PROFILE ? (
              <span className={styles.statusChip}>{TEST_FUNDS_LABEL}</span>
            ) : null}
            <OverviewLiveHealth agentId={agent.id} />
          </div>
        </div>
        <OverviewActions
          floatState={floatHealth.state}
          policy={policy}
          query={query}
          status={agent.status}
        />
      </header>

      <OverviewStateNotices
        hasAddress={agent.agentAddress !== null}
        notifications={notifications}
        paymentProfile={agent.paymentProfile}
        policy={policy}
        query={query}
        status={agent.status}
        floatHealth={floatHealth}
      />

      {!terminal && policy ? (
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
          <div
            aria-label={capUsageDescription(policy)}
            className={`${styles.spendTrack} ${policy.halted ? styles.haltedTrack : ""}`}
            role="img"
          >
            <span
              className={styles.settledFill}
              style={{ width: capFillWidth(policy.spend.settledFillBasisPoints ?? "0") }}
            />
            <span
              className={styles.pendingFill}
              style={{ width: capFillWidth(policy.spend.reservedFillBasisPoints ?? "0") }}
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
              {BigInt(policy.spend.reservedAtomic) > BigInt(0)
                ? `incl. ${formatUsdAtomic(policy.spend.reservedAtomic)} reserved / unsettled`
                : "No reserved authorizations"}
            </span>
            <span>{policy.halted ? "Payments halted at the cap" : "Cap gate active"}</span>
            <span>{blockedReceiptEvidence(policy.spend.blockedReceiptCount)}</span>
            <CycleResetLine
              frequency={policy.cap.frequency}
              nextResetAt={policy.cycle.nextResetAt}
            />
          </div>
        </section>
      ) : null}

      <OverviewCards
        agent={agent}
        floats={floats}
        health={floatHealth}
        keySummary={keySummary}
        query={query}
      />

      <OverviewReceipts query={query} receipts={receipts} />

      <OverviewNotifications
        agentId={agent.id}
        notifications={notifications}
        unreadCount={unreadCount}
      />
    </main>
  );
}
