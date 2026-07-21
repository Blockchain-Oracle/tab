import { RollingAmount } from "@tab/ui";
import Link from "next/link";

import { blockedReceiptEvidence, type CapPolicyView } from "../../../../../lib/leash/cap-view";
import {
  capFillWidth,
  formatBasisPoints,
  formatUsdAtomic,
  formatUsdCents,
} from "../../../../../lib/leash/leash-format";
import styles from "./payment-cap-status.module.css";

export function PaymentCapStatus({
  agentId,
  policy,
}: {
  agentId: string;
  policy: CapPolicyView | null;
}) {
  if (!policy) return null;
  const href = `/agents/cap?agentId=${encodeURIComponent(agentId)}`;
  return (
    <>
      <section aria-label="Current cap usage" className={styles.capMirror}>
        <div>
          <strong>
            <RollingAmount value={formatUsdAtomic(policy.spend.committedAtomic)} />
          </strong>
          <span>/ {formatUsdCents(policy.cap.amountUsdCents)}</span>
          <b>{formatBasisPoints(policy.spend.committedBasisPoints ?? "0")}</b>
        </div>
        <span className={styles.capTrack}>
          <i style={{ width: capFillWidth(policy.spend.committedBasisPoints ?? "0") }} />
        </span>
      </section>
      {policy.halted || policy.spend.atOrAboveLimit ? (
        <section className={styles.limitAlert} role="alert">
          <div>
            <b>ACTION REQUIRED · PAYMENTS HALTED</b>
            <span>
              Blocked attempts appear below; none were sent.{" "}
              {blockedReceiptEvidence(policy.spend.blockedReceiptCount)}
            </span>
          </div>
          <Link href={href}>Raise cap</Link>
        </section>
      ) : policy.spend.approaching ? (
        <section className={styles.limitAlert} role="status">
          <div>
            <b>ALERT · CAP NEAR LIMIT</b>
            <span>
              {formatBasisPoints(policy.spend.committedBasisPoints ?? "0")} is committed this cycle.
            </span>
          </div>
          <Link href={href}>Adjust cap</Link>
        </section>
      ) : null}
    </>
  );
}
