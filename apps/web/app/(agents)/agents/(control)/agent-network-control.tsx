import styles from "./agent-network-control.module.css";

/**
 * Same NETWORK vocabulary as the merchant sidebar, agent truth: an agent
 * lives on ONE network, chosen at provisioning. This shows which one —
 * no silent absence, no fake switch.
 */
export function AgentNetworkControl({ network }: { network: "mainnet" | "testnet" }) {
  return (
    <section aria-label="Agent network">
      <div className={styles.label}>NETWORK</div>
      <div className={styles.control}>
        <span className={network === "testnet" ? styles.selected : styles.other}>TESTNET</span>
        <span className={network === "mainnet" ? styles.selectedLive : styles.other}>MAINNET</span>
      </div>
      <p className={styles.note}>
        {network === "testnet"
          ? "This agent lives on Base Sepolia. Provision a Mainnet agent to run on real rails."
          : "This agent lives on Base + Arbitrum with real USDC."}
      </p>
    </section>
  );
}
