import Link from "next/link";
import type { readOwnerLeashKey } from "../../../../lib/auth/leash-key";
import { truncateHash } from "../../../../lib/format/truncate-hash";
import { formatUsdAtomic } from "../../../../lib/leash/leash-format";
import type { OwnerAgent } from "../../../../lib/leash/owner-agents";
import { BASE_SEPOLIA_INTEGRATION_PROFILE } from "../../../../lib/leash/payment-profile";
import { EvidenceCopyButton } from "./evidence-copy-button";
import type { FloatHealth } from "./float-health";
import styles from "./overview-cards.module.css";
import { RelativeTime } from "./relative-time";

type KeySummary = Awaited<ReturnType<typeof readOwnerLeashKey>>;
type FloatRead = { balanceAtomic: string | null; label: string; network: string };

function maskedKey(key: NonNullable<KeySummary>) {
  return `${key.prefix}••••••••${key.last4}`;
}

export function connectionState(
  agent: Pick<OwnerAgent, "clientName" | "lastSeenAt">,
  now = Date.now(),
) {
  if (!agent.clientName) return "Not connected";
  if (!agent.lastSeenAt) return "Idle";
  const age = now - agent.lastSeenAt.getTime();
  return age >= 0 && age <= 5 * 60 * 1_000 ? "Active" : "Idle";
}

function keyState(agent: OwnerAgent, keySummary: KeySummary) {
  if (keySummary?.rotatedFromId) return "Rotated";
  if (keySummary) return "Active";
  if (agent.status === "nuked") return "Destroyed";
  if (agent.status === "cancelled") return "Revoked";
  return "Not issued";
}

export function OverviewCards({
  agent,
  floats,
  health,
  keySummary,
  query,
}: {
  agent: OwnerAgent;
  floats: FloatRead[] | null;
  health: FloatHealth;
  keySummary: KeySummary;
  query: string;
}) {
  const terminal = agent.status === "cancelled" || agent.status === "nuked";
  const connection = connectionState(agent);
  return (
    <section className={styles.cards}>
      <article
        className={
          health.state === "low" || health.state === "empty" ? styles.lowBalanceCard : undefined
        }
      >
        <span className={styles.cardLabel}>AGENT BALANCE</span>
        {health.state === "low" ? <b className={styles.cardState}>LOW</b> : null}
        {health.state === "empty" ? <b className={styles.cardState}>EMPTY</b> : null}
        <strong>
          {health.totalAtomic === null
            ? health.state === "not_provisioned"
              ? "Not provisioned"
              : "Live read unavailable"
            : formatUsdAtomic(health.totalAtomic.toString())}
        </strong>
        <p>
          {agent.agentAddress
            ? agent.paymentProfile === BASE_SEPOLIA_INTEGRATION_PROFILE
              ? "Base Sepolia test funds"
              : "Native USDC floats"
            : "No signing address exists"}
        </p>
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
        {agent.agentAddress && !terminal ? (
          <Link href={`/agents/funds${query}`}>Add funds</Link>
        ) : null}
      </article>
      <article>
        <span className={styles.cardLabel}>CONNECTED AGENT</span>
        <strong>{agent.clientName ?? "No client connected"}</strong>
        <b
          className={`${styles.cardState} ${connection === "Active" ? styles.activeConnection : styles.idleConnection}`}
        >
          {connection}
        </b>
        <p>
          {agent.transport ?? "Connection metadata appears after the first real initialize call."}
        </p>
        {agent.lastSeenAt ? (
          <small>
            <RelativeTime prefix="Last seen" value={agent.lastSeenAt.toISOString()} />
          </small>
        ) : (
          <small>{agent.connectionCount} recorded connections</small>
        )}
        <Link href={`/agents/connect${query}`}>Manage connection</Link>
      </article>
      <article>
        <span className={styles.cardLabel}>AGENT KEY</span>
        <strong>{keyState(agent, keySummary)}</strong>
        <p className={styles.mono}>
          {keySummary ? maskedKey(keySummary) : "No active key material"}
        </p>
        <small>
          {keySummary?.rotatedFromId
            ? "Rotation lineage stored in PostgreSQL"
            : keySummary
              ? "Hash stored at rest · reveal unavailable"
              : "Credential state comes from the stored agent lifecycle"}
        </small>
      </article>
      <article>
        <span className={styles.cardLabel}>SERVER SIGNER</span>
        <strong>
          {terminal
            ? "Not provisioned"
            : agent.agentAddress
              ? truncateHash(agent.agentAddress, 6, 6)
              : "Not provisioned yet"}
        </strong>
        {agent.agentAddress ? (
          <EvidenceCopyButton label="Copy stored signer address" value={agent.agentAddress} />
        ) : null}
        <p>
          {terminal
            ? "Historical address retained as evidence; do not deposit."
            : agent.agentAddress
              ? "Hosted signer address · credential state shown above"
              : "Provision the agent to create its hosted signing wallet."}
        </p>
        <small>
          Key held in Tab’s encrypted server custody — never in your agent’s context. Hardware
          enclave (TEE) custody switches on with the Magic integration.
        </small>
      </article>
    </section>
  );
}
