import Link from "next/link";

import type { OwnerAgent } from "../../../../lib/leash/owner-agents";
import styles from "./control-page.module.css";

export function AgentPicker({ agents, selectedId }: { agents: OwnerAgent[]; selectedId: string }) {
  if (agents.length < 2) return null;
  return (
    <form className={styles.agentPicker} method="get">
      <label>
        <span>Agent</span>
        <select defaultValue={selectedId} name="agentId">
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit">Open</button>
    </form>
  );
}

export function NoAgentState() {
  return (
    <main className={styles.emptyPage}>
      <section className={styles.emptyCard}>
        <span className={styles.blockedLabel}>BLOCKED · SIGNER PROVISIONING</span>
        <h1>No agent has been created</h1>
        <p>
          Agent provisioning stays disabled until the funded Magic OIDC signing spike is verified.
          No wallet, balance, cap, or connection has been fabricated for this account.
        </p>
        <Link href="/agents/provision">Set up agent</Link>
      </section>
    </main>
  );
}
