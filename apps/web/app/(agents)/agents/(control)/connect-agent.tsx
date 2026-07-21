"use client";

import { useState } from "react";

import type { LeashKeyView } from "../../../../lib/leash/leash-key-view";
import styles from "./connect-agent.module.css";
import { ConnectConfigPanel } from "./connect-config-panel";
import { KeyLifecycle } from "./key-lifecycle";

type AgentView = {
  clientName: string | null;
  connectionCount: number;
  id: string;
  lastSeenAt: string | null;
  transport: string | null;
};

export function ConnectAgent({
  agent,
  apiBaseUrl,
  configurationIssue,
  initialKey,
}: {
  agent: AgentView;
  apiBaseUrl: string | null;
  configurationIssue?: string | null;
  initialKey: LeashKeyView | null;
}) {
  const connected = agent.connectionCount > 0;
  const [currentKey, setCurrentKey] = useState(initialKey);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>CONNECT YOUR AGENT</p>
          <h1>One credential for x402 payments</h1>
          <span className={styles.subtitle}>
            Agent has no model. It only pays requests your own agent makes, within your cap.
          </span>
        </div>
        <span className={connected ? styles.activeChip : styles.waitingChip}>
          {connected ? "Connected" : currentKey ? "Awaiting initialize" : "Not connected"}
        </span>
      </header>

      <section aria-label="Connection progress" className={styles.steps}>
        <div className={currentKey ? styles.doneStep : styles.currentStep}>
          <b>1</b>
          <span>Key created</span>
        </div>
        <div
          className={
            connected ? styles.doneStep : currentKey ? styles.currentStep : styles.pendingStep
          }
        >
          <b>2</b>
          <span>Agent initialized</span>
        </div>
        <div className={connected ? styles.currentStep : styles.pendingStep}>
          <b>3</b>
          <span>Listening for x402</span>
        </div>
      </section>

      <KeyLifecycle agentId={agent.id} initialKey={initialKey} onKeyChange={setCurrentKey} />

      <ConnectConfigPanel apiBaseUrl={apiBaseUrl} configurationIssue={configurationIssue} />

      <section className={styles.connectionCard}>
        <span className={styles.eyebrow}>REAL CONNECTION STATE</span>
        <strong>{agent.clientName ?? "No initialize call recorded"}</strong>
        <p>
          {agent.transport ??
            "Client and transport appear after the first authenticated MCP initialize call."}
        </p>
        <small>
          {agent.connectionCount} recorded connection{agent.connectionCount === 1 ? "" : "s"}
        </small>
      </section>
    </main>
  );
}
