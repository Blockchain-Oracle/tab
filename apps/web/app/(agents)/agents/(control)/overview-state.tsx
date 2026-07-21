import Link from "next/link";

import type { CapPolicyView } from "../../../../lib/leash/cap-view";
import { formatBasisPoints, formatUsdAtomic } from "../../../../lib/leash/leash-format";
import type { OwnerAgent } from "../../../../lib/leash/owner-agents";
import {
  BASE_SEPOLIA_INTEGRATION_PROFILE,
  type PaymentProfile,
} from "../../../../lib/leash/payment-profile";
import type { FloatHealth } from "./float-health";
import type { NotificationPreview } from "./overview-notifications";
import styles from "./overview-state.module.css";

type Status = OwnerAgent["status"];

export function OverviewActions({
  floatState,
  policy,
  query,
  status,
}: {
  floatState: FloatHealth["state"];
  policy: CapPolicyView | null;
  query: string;
  status: Status;
}) {
  if (status === "cancelled" || status === "nuked") {
    return (
      <div className={styles.headerActions}>
        <Link href={`/leash/provision${query}`}>Provision new agent</Link>
        <Link className={styles.secondaryAction} href={`/leash/funds${query}`}>
          Review remaining floats
        </Link>
      </div>
    );
  }
  if (floatState === "empty" || floatState === "low") {
    return (
      <div className={styles.headerActions}>
        <Link href={`/leash/funds${query}`}>Add funds</Link>
        <Link className={styles.secondaryAction} href={`/leash/cap${query}`}>
          Adjust cap
        </Link>
      </div>
    );
  }
  const revocationLabel =
    status === "paused"
      ? "Resume payments"
      : status === "frozen"
        ? "Unfreeze signer"
        : "Pause payments";
  return (
    <div className={styles.headerActions}>
      <Link href={`/leash/cap${query}`}>{policy?.halted ? "Raise cap" : "Adjust cap"}</Link>
      <Link className={styles.secondaryAction} href={`/leash/revocation${query}`}>
        {policy?.halted
          ? "Revocation controls"
          : status === "provisioned"
            ? "Pause payments"
            : revocationLabel}
      </Link>
    </div>
  );
}

export function OverviewStateNotices({
  floatHealth,
  hasAddress,
  notifications,
  paymentProfile,
  policy,
  query,
  status,
}: {
  floatHealth: FloatHealth;
  hasAddress: boolean;
  notifications: NotificationPreview[];
  paymentProfile: PaymentProfile;
  policy: CapPolicyView | null;
  query: string;
  status: Status;
}) {
  if (status === "cancelled" || status === "nuked") {
    return (
      <section className={styles.warning} role="status">
        <div>
          <strong>
            {status === "nuked" ? "Signing credential destroyed." : "Credential cancelled."}
          </strong>
          <p>
            {status === "nuked"
              ? "Leash cannot withdraw remaining floats after nuclear destruction. Review balances, then provision a new agent."
              : "Every Leash key is invalid. Provisioning remains blocked on B-03."}
          </p>
        </div>
        <Link href={`/leash/provision${query}`}>Provision new agent</Link>
      </section>
    );
  }

  const floatEvent = notifications.find(
    (notification) => notification.type === "float_empty" || notification.type === "float_low",
  );
  const floatEmpty = hasAddress && floatHealth.state === "empty";
  const floatLow = floatHealth.state === "low";
  const storedFloatWarning = floatHealth.state === "unavailable" && floatEvent !== undefined;
  return (
    <>
      {!policy ? (
        <section className={styles.warning}>
          <div>
            <strong>Set a cap to enable payments.</strong>
            <p>The hosted signer currently refuses every payment for this agent.</p>
          </div>
          <Link href={`/leash/cap${query}`}>Set cap</Link>
        </section>
      ) : policy.halted ? (
        <section className={styles.warning} role="alert">
          <div>
            <strong>Payments halted at the cap.</strong>
            <p>New attempts are blocked before signing and recorded in the receipt ledger.</p>
          </div>
          <Link href={`/leash/cap${query}`}>Raise cap</Link>
        </section>
      ) : policy.spend.approaching ? (
        <section className={styles.warning} role="status">
          <div>
            <strong>Agent spend is approaching the cap.</strong>
            <p>
              {formatBasisPoints(policy.spend.committedBasisPoints ?? "0")} committed this cycle.
            </p>
          </div>
          <Link href={`/leash/cap${query}`}>Adjust cap</Link>
        </section>
      ) : null}
      {floatEmpty || floatLow || storedFloatWarning ? (
        <section className={styles.warning} role="status">
          <div>
            <strong>
              {floatEmpty || floatEvent?.type === "float_empty"
                ? "Agent float is empty."
                : "Agent float is low."}
            </strong>
            <p>
              {floatEmpty
                ? paymentProfile === BASE_SEPOLIA_INTEGRATION_PROFILE
                  ? "Live Base Sepolia test-fund read returned zero."
                  : "Live Base and Arbitrum reads both returned zero."
                : floatLow && floatHealth.totalAtomic !== null
                  ? `${formatUsdAtomic(floatHealth.totalAtomic.toString())} remains, below the fixed $5 floor. Percentage threshold is unavailable until a real top-up event exists.`
                  : "This warning comes from a stored real float event; the current live read is unavailable."}
            </p>
          </div>
          <Link href={`/leash/funds${query}`}>Open funds</Link>
        </section>
      ) : null}
    </>
  );
}
