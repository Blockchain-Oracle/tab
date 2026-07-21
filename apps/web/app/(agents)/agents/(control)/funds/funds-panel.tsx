import type { LeashFundsSnapshot } from "../../../../../lib/leash/fund-balances";
import { BASE_SEPOLIA_INTEGRATION_PROFILE } from "../../../../../lib/leash/payment-profile";
import { TEST_FUNDS_LABEL } from "../../../../../lib/leash/test-funds";
import { EvidenceCopyButton } from "../evidence-copy-button";
import { classifyFloatHealth } from "../float-health";
import { FundsBalanceGrid } from "./funds-balance-grid";
import styles from "./funds-panel.module.css";

type AgentStatus = "provisioned" | "paused" | "frozen" | "cancelled" | "nuked";

const blockedActions = [
  {
    body: "Move unified liquidity into a selected native-USDC float.",
    button: "Top up",
    title: "Top up float",
  },
  {
    body: "Restore a low float asynchronously, outside the x402 payment path.",
    button: "Enable",
    title: "Auto-rebalance",
  },
  {
    body: "Move remaining float funds before destroying a signing credential.",
    button: "Withdraw",
    title: "Withdraw funds",
  },
] as const;

function readState(snapshot: LeashFundsSnapshot) {
  const complete =
    (snapshot.unified.state === "available" ||
      snapshot.unified.state === "not_applicable_testnet") &&
    snapshot.floats?.every((float) => float.balanceAtomic !== null);
  if (complete) return { className: styles.readChip, label: "LIVE READS" };
  return {
    className: styles.blockedChip,
    label: snapshot.agentAddress ? "PARTIAL READ" : "NOT PROVISIONED",
  };
}

export function FundsPanel({
  agentName,
  agentStatus,
  snapshot,
}: {
  agentName: string;
  agentStatus: AgentStatus;
  snapshot: LeashFundsSnapshot;
}) {
  const reads = readState(snapshot);
  const health = classifyFloatHealth(snapshot.floats, snapshot.agentAddress !== null);
  const terminal = agentStatus === "cancelled" || agentStatus === "nuked";
  const testFunds = snapshot.paymentProfile === BASE_SEPOLIA_INTEGRATION_PROFILE;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>FLOAT TREASURY</p>
        <h1>Funds</h1>
        <p>Live balances for {agentName}. Reads never move money.</p>
        {testFunds ? (
          <p role="status">
            <strong>{TEST_FUNDS_LABEL}</strong> · Base Sepolia integration profile
          </p>
        ) : null}
      </header>

      <section aria-labelledby="funding-address-title">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="funding-address-title">Agent signing address</h2>
            <p>The stored address is independent of Particle unified-balance availability.</p>
          </div>
          <span className={styles.blockedChip}>
            {!snapshot.agentAddress
              ? "NOT PROVISIONED"
              : terminal
                ? "HISTORY ONLY"
                : "FUNDING ENTRY"}
          </span>
        </div>
        <article className={styles.unifiedCard}>
          <strong>{snapshot.agentAddress ?? "Funding entry unavailable"}</strong>
          {snapshot.agentAddress ? (
            <EvidenceCopyButton label="Copy agent signing address" value={snapshot.agentAddress} />
          ) : null}
          <p>
            {!snapshot.agentAddress
              ? "A real provider address is required before funds can be sent or read."
              : terminal
                ? "Do not deposit. This address is retained only for receipt and balance evidence."
                : testFunds
                  ? "Send Circle Base Sepolia USDC test funds to this address."
                  : "Send native USDC on Base or Arbitrum to this address."}
          </p>
        </article>
      </section>

      {agentStatus === "nuked" ? (
        <section className={styles.unifiedCard} role="alert">
          <strong>Signing credential destroyed</strong>
          <p>
            Leash withdrawal is unavailable after nuclear destruction. Any remaining floats may be
            stranded.
          </p>
        </section>
      ) : null}

      <section aria-labelledby="balances-title">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="balances-title">Available liquidity</h2>
            <p>
              {testFunds
                ? "Base Sepolia is isolated from the separate Particle mainnet balance."
                : "Unified balance includes floats; chain balances are not added again."}
            </p>
          </div>
          <span className={reads.className}>{reads.label}</span>
        </div>
        <FundsBalanceGrid health={health} snapshot={snapshot} />
      </section>

      <section aria-describedby="money-blocker" aria-labelledby="money-actions-title">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="money-actions-title">Money movement</h2>
            <p id="money-blocker">
              These actions stay off until the funded Particle + Magic spike passes.
            </p>
          </div>
          <span className={styles.blockedChip}>BLOCKED · B-04</span>
        </div>
        <div className={styles.actionGrid}>
          {blockedActions.map((action) => (
            <article key={action.title}>
              <h3>{action.title}</h3>
              <p>{action.body}</p>
              <button disabled type="button">
                {action.button}
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
