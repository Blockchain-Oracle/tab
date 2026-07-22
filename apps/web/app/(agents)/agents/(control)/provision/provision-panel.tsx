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
  const [network, setNetwork] = useState<"mainnet" | "testnet">("testnet");
  const [currentAgent, setCurrentAgent] = useState(agent);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [success, setSuccess] = useState<{ label?: string; testFunds: boolean } | null>(null);

  async function provisionWallet() {
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/agents/provision", {
        body: JSON.stringify({
          ...(currentAgent ? { agentId: currentAgent.id } : {}),
          name: agentName.trim(),
          network,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = (await response.json()) as {
        agent?: { address?: unknown; id?: unknown; name?: unknown; paymentProfile?: unknown };
        error?: { code?: unknown; message?: unknown };
        label?: unknown;
        testFunds?: unknown;
      };
      if (response.ok) {
        if (
          typeof body.agent?.address !== "string" ||
          !/^0x[0-9a-fA-F]{40}$/.test(body.agent.address) ||
          typeof body.agent.id !== "string" ||
          typeof body.agent.name !== "string" ||
          typeof body.testFunds !== "boolean" ||
          (body.label !== undefined && typeof body.label !== "string")
        ) {
          throw new Error("The wallet provider returned an invalid response.");
        }
        setCurrentAgent({
          agentAddress: body.agent.address,
          id: body.agent.id,
          name: body.agent.name,
        });
        setSuccess({
          ...(typeof body.label === "string" ? { label: body.label } : {}),
          testFunds: body.testFunds,
        });
        return;
      }
      if (typeof body.error?.code !== "string" || typeof body.error.message !== "string") {
        throw new Error("The wallet provider returned an invalid error response.");
      }
      setError({ code: body.error.code, message: body.error.message });
    } catch (caught) {
      setError({
        code: "PROVISION_REQUEST_FAILED",
        message: caught instanceof Error ? caught.message : "The wallet request could not run.",
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
        <span className={styles.blockedChip}>HOSTED SIGNER</span>
        <h1 id="provision-title">Provision an agent wallet</h1>
        <p>
          Tab requests a TEE-backed Express Server Wallet for this agent and stores only the
          provider-returned public address.
        </p>
        <div className={styles.agentContext}>
          <span>Agent address</span>
          <strong>{currentAgent?.agentAddress ?? "Not provisioned"}</strong>
          {currentAgent?.agentAddress ? (
            <EvidenceCopyButton
              label="Copy existing agent address"
              value={currentAgent.agentAddress}
            />
          ) : null}
          <small>
            {currentAgent?.agentAddress
              ? "Existing stored address — retained as evidence, not a newly provisioned wallet."
              : "No wallet has been created yet."}
          </small>
        </div>
        <div className={styles.truthNote} id="provision-status">
          <strong>{success ? "Wallet provisioned" : "Provider-backed only"}</strong>
          <span>
            {success
              ? "Magic returned this address for the agent's stable opaque identity."
              : "Tab will show an address only after the real provider returns one."}
          </span>
          {success?.testFunds ? <span>{success.label}</span> : null}
          {error ? (
            <span aria-live="polite" role="status">
              <code>{error.code}</code> · {error.message}
            </span>
          ) : null}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void provisionWallet();
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
          <fieldset className={styles.networkChoice}>
            <legend>Network</legend>
            <label>
              <input
                checked={network === "testnet"}
                name="network"
                onChange={() => setNetwork("testnet")}
                type="radio"
                value="testnet"
              />
              Testnet — Base Sepolia, free sandbox funds
            </label>
            <label>
              <input
                checked={network === "mainnet"}
                name="network"
                onChange={() => setNetwork("mainnet")}
                type="radio"
                value="mainnet"
              />
              Mainnet — Base + Arbitrum, real USDC you deposit yourself
            </label>
          </fieldset>
          <button aria-describedby="provision-status" disabled={pending} type="submit">
            {pending ? "Provisioning…" : `Provision ${network} agent`}
          </button>
        </form>
        <Link
          href={currentAgent ? `/agents?agentId=${encodeURIComponent(currentAgent.id)}` : "/agents"}
        >
          Return to overview
        </Link>
      </section>
    </main>
  );
}
