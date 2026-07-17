import type { LeashFundsSnapshot } from "../../../../../lib/leash/fund-balances";
import { formatUsdAtomic } from "../../../../../lib/leash/leash-format";
import type { FloatHealth } from "../float-health";
import styles from "./funds-panel.module.css";

const usd = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: "currency",
});

function unifiedValue(snapshot: LeashFundsSnapshot) {
  if (snapshot.unified.state === "available") return usd.format(snapshot.unified.balanceUsd);
  if (snapshot.unified.state === "not_provisioned") return "Not provisioned";
  return "Unavailable";
}

function unifiedNote(snapshot: LeashFundsSnapshot) {
  switch (snapshot.unified.state) {
    case "available":
      return "Verified by Particle against this agent’s stored EOA.";
    case "configuration_unavailable":
      return "Particle read configuration is unavailable.";
    case "read_unavailable":
      return "Particle could not verify this balance right now.";
    case "not_provisioned":
      return "A real agent address is required before Particle can verify a UA.";
  }
}

function totalLabel(health: FloatHealth) {
  return health.totalAtomic === null
    ? health.state === "not_provisioned"
      ? "Not provisioned"
      : "Unavailable"
    : formatUsdAtomic(health.totalAtomic.toString());
}

function thresholdCopy(health: FloatHealth) {
  if (health.state === "low") return "LOW · BELOW $5 FLOOR";
  if (health.state === "funded") return "ABOVE FIXED FLOOR";
  return null;
}

export function FundsBalanceGrid({
  health,
  snapshot,
}: {
  health: FloatHealth;
  snapshot: LeashFundsSnapshot;
}) {
  return (
    <div className={styles.balanceGrid}>
      <article className={styles.floatCard}>
        <div className={styles.cardLabel}>
          <span>Native USDC float total</span>
          {health.state === "empty" ? <b>EMPTY</b> : null}
          {health.state === "low" ? <b className={styles.lowLabel}>LOW</b> : null}
        </div>
        <strong>{totalLabel(health)}</strong>
        <p>
          {health.state === "unavailable"
            ? "At least one chain read failed, so no total is shown."
            : health.state === "not_provisioned"
              ? "No signing address exists to read."
              : "Sum of the live Base and Arbitrum balanceOf reads."}
        </p>
        {thresholdCopy(health) ? <code>{thresholdCopy(health)}</code> : null}
        {health.state === "low" ? <p>The fixed $5 floor is active.</p> : null}
        {health.state === "low" || health.state === "funded" ? (
          <p>Percentage threshold is unavailable until a real top-up event exists.</p>
        ) : null}
      </article>
      <article className={styles.unifiedCard}>
        <div className={styles.cardLabel}>
          <span>Owner unified balance</span>
          <b>Includes floats</b>
        </div>
        <strong>{unifiedValue(snapshot)}</strong>
        <p>{unifiedNote(snapshot)}</p>
        {snapshot.unified.state === "available" ? (
          <code>{snapshot.unified.depositAddress}</code>
        ) : null}
      </article>
      {snapshot.floats ? (
        snapshot.floats.map((float) => (
          <article className={styles.floatCard} key={float.network}>
            <span className={styles.cardLabel}>{float.label} float</span>
            <strong>
              {float.balanceAtomic === null ? "Unavailable" : formatUsdAtomic(float.balanceAtomic)}
            </strong>
            <p>Native USDC</p>
            <code>{float.network}</code>
          </article>
        ))
      ) : (
        <article className={styles.floatCard}>
          <span className={styles.cardLabel}>NATIVE USDC FLOATS</span>
          <strong>Not provisioned</strong>
          <p>No signing address exists to read.</p>
        </article>
      )}
    </div>
  );
}
