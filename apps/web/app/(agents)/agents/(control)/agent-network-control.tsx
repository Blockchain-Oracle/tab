import styles from "./agent-network-control.module.css";

/**
 * Same NETWORK control the merchant sidebar has, agent truth: agents live
 * on one network. TESTNET is where every agent runs today; MAINNET is
 * visibly present and honestly locked until live verification (B-04) —
 * never a silent absence, never a fake switch.
 */
export function AgentNetworkControl() {
  return (
    <section aria-label="Agent network">
      <div className={styles.label}>NETWORK</div>
      <div className={styles.control}>
        <span aria-pressed="true" className={styles.selected} role="button">
          TESTNET
        </span>
        <span
          aria-disabled="true"
          className={styles.locked}
          title="Mainnet agents unlock after live money-mover verification (B-04)."
        >
          MAINNET
        </span>
      </div>
      <p className={styles.note}>
        This agent lives on Base Sepolia. Mainnet unlocks after live verification.
      </p>
    </section>
  );
}
