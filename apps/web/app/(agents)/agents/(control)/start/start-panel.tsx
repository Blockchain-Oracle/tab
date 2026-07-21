"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FaucetClaim } from "../funds/faucet-claim";
import styles from "./start.module.css";

type StepKey =
  | "connect_mcp"
  | "first_paid_call"
  | "fund_agent"
  | "provision_agent"
  | "review_evidence"
  | "set_cap";

export type StartPanelState = {
  autoGrantEligible: boolean;
  completedCount: number;
  currentKey: StepKey | null;
  settledReceiptId: string | null;
  steps: Array<{ completion: "derived" | "manual"; done: boolean; key: StepKey; title: string }>;
};

type StartPanelProps = {
  agentAddress: string | null;
  agentId: string | null;
  agentName: string | null;
  state: StartPanelState;
  testnet: boolean;
};

const STEP_COPY: Record<StepKey, { description: string; href?: string; hrefLabel?: string }> = {
  provision_agent: {
    description:
      "Create the hosted signer your agent pays from. The key lives server-side — your agent never holds it.",
    href: "/agents/provision",
    hrefLabel: "Provision",
  },
  set_cap: {
    description: "Cap what the agent can spend per cycle. The cap is enforced outside the model.",
    href: "/agents/cap",
    hrefLabel: "Set cap",
  },
  fund_agent: {
    description: "x402 spends USDC already sitting at the signing address.",
    href: "/agents/funds",
    hrefLabel: "Open funds",
  },
  connect_mcp: {
    description:
      "Point your MCP client at the Tab proxy. This completes when the proxy first sees your agent connect.",
    href: "/agents/connect",
    hrefLabel: "Get config",
  },
  first_paid_call: {
    description:
      "Have the agent call any x402 resource. The 402 is paid within the cap and settlement writes the receipt.",
    href: "/agents/payments",
    hrefLabel: "Watch live",
  },
  review_evidence: {
    description:
      "Every payment leaves a receipt: amount, network, transaction hash, cap context. Open the first one.",
  },
};

export function StartPanel({ agentAddress, agentId, agentName, state, testnet }: StartPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<StepKey>();
  const [error, setError] = useState<string>();
  const complete = state.completedCount === state.steps.length;

  async function markDone(key: StepKey) {
    if (busy) return;
    setBusy(key);
    setError(undefined);
    try {
      const response = await fetch(`/api/agents/onboarding/steps/${key}/complete`, {
        body: JSON.stringify(key === "fund_agent" && agentId ? { agentId } : {}),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error("Progress update failed");
      router.refresh();
    } catch {
      setError("Progress was not saved. Try again without leaving this page.");
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <section aria-labelledby="start-title" className={styles.panel}>
      <header className={styles.header}>
        <div>
          <h1 id="start-title">Get started</h1>
          <p>
            {agentName ? (
              <>
                From provisioning <strong>{agentName}</strong> to its first receipt. Every step
                completes from a real event.
              </>
            ) : (
              "From provisioning to the first receipt. Every step completes from a real event."
            )}
          </p>
        </div>
        <span className={styles.count}>
          {state.completedCount} of {state.steps.length} complete
        </span>
      </header>

      {complete ? (
        <section aria-label="Setup complete" className={styles.milestone}>
          <span aria-hidden="true" className={styles.milestoneMark}>
            ✓
          </span>
          <div>
            <strong>Your agent pays by itself — inside the cap you set.</strong>
            <p>Watch it live, or review the evidence trail any time.</p>
          </div>
          <Link href="/agents">Open overview</Link>
        </section>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <ol className={styles.steps}>
        {state.steps.map((step, index) => {
          const copy = STEP_COPY[step.key];
          const active = step.key === state.currentKey;
          const evidenceHref =
            step.key === "review_evidence" && state.settledReceiptId
              ? `/agents/receipts/${state.settledReceiptId}`
              : copy.href;
          const ackReady = step.key !== "review_evidence" || Boolean(state.settledReceiptId);
          return (
            <li className={styles.step} data-active={active || undefined} key={step.key}>
              <span aria-hidden="true" className={step.done ? styles.doneMark : styles.stepMark}>
                {step.done ? "✓" : index + 1}
              </span>
              <div className={styles.stepBody}>
                <div className={styles.stepHeading}>
                  <strong>{step.title}</strong>
                  {step.done ? <span className={styles.doneLabel}>Done</span> : null}
                  {!step.done && step.completion === "manual" && ackReady ? (
                    <button
                      className={styles.ackButton}
                      disabled={Boolean(busy)}
                      onClick={() => void markDone(step.key)}
                      type="button"
                    >
                      {busy === step.key
                        ? "Saving…"
                        : step.key === "review_evidence"
                          ? "Mark reviewed"
                          : "Mark done"}
                    </button>
                  ) : null}
                  {!step.done && evidenceHref ? (
                    <Link className={styles.stepLink} href={evidenceHref}>
                      {step.key === "review_evidence" ? "Open receipt" : (copy.hrefLabel ?? "Open")}
                    </Link>
                  ) : null}
                </div>
                <p>{copy.description}</p>
                {step.key === "fund_agent" && !step.done && testnet && agentAddress && agentId ? (
                  <FaucetClaim
                    agentAddress={agentAddress}
                    agentId={agentId}
                    auto={state.autoGrantEligible}
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
