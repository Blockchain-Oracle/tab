"use client";

import type { FaucetGrantReport } from "@tab/faucet";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { truncateHash } from "../../../../../lib/format/truncate-hash";
import styles from "./faucet-claim.module.css";

type ClaimState =
  | { kind: "claiming" }
  | { kind: "error"; message: string }
  | { kind: "idle" }
  | { kind: "rate-limited"; retryAfterSeconds: number }
  | { kind: "report"; report: FaucetGrantReport };

const LEG_LABEL = { gas: "Gas (ETH)", usdc: "Test USDC" } as const;

/**
 * The starter-grant claim: one press sends REAL Base Sepolia transfers to
 * the agent address. Every leg renders its truthful outcome — tx hash +
 * explorer link when funded, verbatim blockers otherwise. Never simulated.
 */
export function FaucetClaim({
  agentAddress,
  agentId,
  auto = false,
}: {
  agentAddress: string;
  agentId: string;
  /** Fire the grant on mount — the wizard's funds step claims by itself. */
  auto?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<ClaimState>({ kind: "idle" });
  const autoFired = useRef(false);

  async function claim() {
    if (state.kind === "claiming") return;
    setState({ kind: "claiming" });
    try {
      const response = await fetch("/api/faucet/claim", {
        body: JSON.stringify({ agentId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (response.status === 429) {
        const retryAfterSeconds = Number(response.headers.get("retry-after") ?? "0");
        setState({ kind: "rate-limited", retryAfterSeconds });
        return;
      }
      const body = (await response.json()) as {
        error?: { message?: string };
        grant?: FaucetGrantReport;
      };
      if (!response.ok || !body.grant) {
        setState({
          kind: "error",
          message: body.error?.message ?? "The grant could not be processed.",
        });
        return;
      }
      setState({ kind: "report", report: body.grant });
      if (body.grant.state !== "unavailable") router.refresh();
    } catch {
      setState({ kind: "error", message: "The faucet could not be reached." });
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: fire-once guard — claim is recreated per render but must not retrigger.
  useEffect(() => {
    if (!auto || autoFired.current) return;
    autoFired.current = true;
    void claim();
  }, [auto]);

  return (
    <section aria-labelledby="faucet-title" className={styles.card}>
      <div className={styles.head}>
        <div>
          <h2 id="faucet-title">Claim test funds</h2>
          <p>
            2 test USDC + gas, sent on-chain to{" "}
            <code className={styles.address}>{truncateHash(agentAddress, 8, 6)}</code>. No external
            faucet needed.
          </p>
        </div>
        <button
          className={styles.claimButton}
          disabled={state.kind === "claiming"}
          onClick={() => void claim()}
          type="button"
        >
          {state.kind === "claiming" ? "Sending on-chain…" : "Claim test funds"}
        </button>
      </div>

      {state.kind === "claiming" ? (
        <div aria-live="polite" className={styles.travel} role="status">
          <span className={styles.travelBar} />
          <span>Real Base Sepolia transfers in flight — this waits for on-chain receipts.</span>
        </div>
      ) : null}

      {state.kind === "rate-limited" ? (
        <p className={styles.notice} role="status">
          Test funds were granted recently. Try again in about{" "}
          {Math.max(1, Math.ceil(state.retryAfterSeconds / 60))} min.
        </p>
      ) : null}

      {state.kind === "error" ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : null}

      {state.kind === "report" ? (
        <ul className={styles.legs}>
          {state.report.legs.map((leg) => (
            <li className={styles.leg} data-state={leg.state} key={leg.asset}>
              <span className={styles.legLabel}>{LEG_LABEL[leg.asset]}</span>
              {leg.state === "funded" && leg.txHash ? (
                <span className={styles.legResult}>
                  <span className={styles.stamp}>Funded</span>
                  <a href={leg.explorerTxUrl} rel="noreferrer" target="_blank">
                    <code>{truncateHash(leg.txHash, 8, 6)}</code> ↗
                  </a>
                </span>
              ) : leg.state === "already-funded" ? (
                <span className={styles.legResult}>Already funded — nothing sent</span>
              ) : (
                <span className={styles.legBlocked} role="alert">
                  {leg.blocker ?? "Not funded"}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <p className={styles.foot}>{`${"Sandbox funds — no real value"} · Base Sepolia only`}</p>
    </section>
  );
}
