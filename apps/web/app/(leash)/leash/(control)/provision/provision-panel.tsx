"use client";

import Link from "next/link";
import { useState } from "react";

import { EvidenceCopyButton } from "../evidence-copy-button";
import styles from "./provision-panel.module.css";

type ProvisionAgentContext = {
  agentAddress: string | null;
  id: string;
  name: string;
};

export function ProvisionPanel({ agent }: { agent: ProvisionAgentContext | null }) {
  const [agentName, setAgentName] = useState(agent?.name ?? "");
  const [pending, setPending] = useState(false);
  const [guard, setGuard] = useState<{ code: string; message: string } | null>(null);

  async function checkProvisioningGuard() {
    setPending(true);
    setGuard(null);
    try {
      const response = await fetch("/api/leash/provision", {
        body: JSON.stringify({ ...(agent ? { agentId: agent.id } : {}), name: agentName.trim() }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = (await response.json()) as {
        error?: { code?: unknown; message?: unknown };
      };
      if (
        response.ok ||
        typeof body.error?.code !== "string" ||
        typeof body.error.message !== "string"
      ) {
        throw new Error("The provisioning guard returned an invalid response.");
      }
      setGuard({ code: body.error.code, message: body.error.message });
    } catch (error) {
      setGuard({
        code: "PROVISION_CHECK_FAILED",
        message: error instanceof Error ? error.message : "The provisioning guard could not run.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <main className={styles.page}>
      <section aria-labelledby="provision-title" className={styles.card}>
        <div aria-hidden="true" className={styles.keyMark}>
          <span />
          <span />
        </div>
        <span className={styles.blockedChip}>BLOCKED · B-03</span>
        <h1 id="provision-title">Provision an agent wallet</h1>
        <p>
          Magic OIDC issuer setup and the first Express wallet provision must pass the live
          integration spike before Tab can request a wallet.
        </p>
        <div className={styles.agentContext}>
          <span>Agent address</span>
          <strong>{agent?.agentAddress ?? "Not provisioned"}</strong>
          {agent?.agentAddress ? (
            <EvidenceCopyButton label="Copy existing agent address" value={agent.agentAddress} />
          ) : null}
          <small>
            {agent?.agentAddress
              ? "Existing stored address — retained as evidence, not a newly provisioned wallet."
              : "No address or balance exists to read. Provisioning requires OIDC setup."}
          </small>
          {!agent?.agentAddress ? (
            <div className={styles.blockedBalance}>
              <strong>$0.00</strong>
              <span>
                BLOCKED placeholder — not a live balance. Provisioning requires OIDC setup.
              </span>
            </div>
          ) : null}
        </div>
        <div className={styles.truthNote} id="provision-blocker">
          <strong>This control has not requested a wallet.</strong>
          <span>Tab will show an address only after the real provider returns one.</span>
          {guard ? (
            <span aria-live="polite" role="status">
              <code>{guard.code}</code> · {guard.message}
            </span>
          ) : null}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void checkProvisioningGuard();
          }}
        >
          <label>
            Agent name
            <input
              autoComplete="off"
              maxLength={80}
              name="agentName"
              onChange={(event) => setAgentName(event.target.value)}
              required
              value={agentName}
            />
          </label>
          <button aria-describedby="provision-blocker" disabled={pending} type="submit">
            {pending ? "Checking configuration…" : "Provision agent"}
          </button>
        </form>
        <Link href={agent ? `/leash?agentId=${encodeURIComponent(agent.id)}` : "/leash"}>
          Return to overview
        </Link>
      </section>
    </main>
  );
}
