"use client";

import { useEffect, useState } from "react";

import {
  blockedReceiptEvidence,
  type CapPolicyView,
  capUsageDescription,
} from "../../../../lib/leash/cap-view";
import {
  capFillWidth,
  formatBasisPoints,
  formatCycleFrequency,
  formatRemaining,
  formatUsdAtomic,
  formatUsdCents,
} from "../../../../lib/leash/leash-format";
import styles from "./cap-panel.module.css";

type CapPanelProps = { agentId: string; initialPolicy: CapPolicyView | null };
type ResponseBody = { error?: { message?: string }; policy?: CapPolicyView };

function amountInput(cents: string | undefined) {
  if (!cents) return "";
  const value = BigInt(cents);
  return `${value / BigInt(100)}.${(value % BigInt(100)).toString().padStart(2, "0")}`;
}

function resetLabel(nextResetAt: string | null, now: Date | null) {
  if (!nextResetAt) return "No scheduled reset";
  return now ? formatRemaining(new Date(nextResetAt), now) : "Countdown starting…";
}

export function CapPanel({ agentId, initialPolicy }: CapPanelProps) {
  const [amount, setAmount] = useState(() => amountInput(initialPolicy?.cap.amountUsdCents));
  const [error, setError] = useState<string>();
  const [frequency, setFrequency] = useState<CapPolicyView["cap"]["frequency"]>(
    initialPolicy?.cap.frequency ?? "daily",
  );
  const [now, setNow] = useState<Date | null>(null);
  const [policy, setPolicy] = useState(initialPolicy);
  const [status, setStatus] = useState<"idle" | "resetting" | "saving">("idle");
  const [success, setSuccess] = useState<string>();

  useEffect(() => {
    setNow(new Date());
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  async function mutate(method: "PATCH" | "POST", body: Record<string, string>) {
    const response = await fetch(
      method === "POST" && body.action === "reset" ? "/api/leash/cycles/reset" : "/api/leash/caps",
      {
        body: JSON.stringify(
          body.action === "reset" ? { agentId } : { agentId, amount, frequency },
        ),
        headers: { "content-type": "application/json" },
        method,
      },
    );
    const result = (await response.json()) as ResponseBody;
    if (!response.ok || !result.policy) {
      throw new Error(result.error?.message ?? "The cap change was not saved.");
    }
    setPolicy(result.policy);
  }

  async function save() {
    if (status !== "idle") return;
    setError(undefined);
    setSuccess(undefined);
    setStatus("saving");
    try {
      await mutate(policy ? "PATCH" : "POST", {});
      setSuccess(policy ? "Cap updated." : "Cap created. Payments can now pass the cap gate.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The cap change was not saved.");
    } finally {
      setStatus("idle");
    }
  }

  async function reset() {
    if (!policy || status !== "idle") return;
    setError(undefined);
    setSuccess(undefined);
    setStatus("resetting");
    try {
      await mutate("POST", { action: "reset" });
      setSuccess("Cycle reset. Current-cycle spend is now zero.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The cycle was not reset.");
    } finally {
      setStatus("idle");
    }
  }

  const committedBasisPoints = policy?.spend.committedBasisPoints ?? "0";
  const hasReserved = policy ? BigInt(policy.spend.reservedAtomic) > BigInt(0) : false;
  const hasOverage = policy ? BigInt(policy.spend.overageAtomic) > BigInt(0) : false;

  return (
    <section className={styles.panel} id="cap-controls">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>THE LEASH ITSELF</p>
          <h1>Cap &amp; limits</h1>
          <p>Changes take effect at the hosted signer immediately. No agent restart is required.</p>
        </div>
        {policy?.halted ? <span className={styles.haltedChip}>Payments halted</span> : null}
      </header>

      {!policy ? (
        <div className={styles.warning} role="status">
          <strong>Set a cap to enable payments.</strong>
          <span>Until a cap exists, the signer refuses every payment.</span>
        </div>
      ) : null}

      {policy ? (
        <article className={styles.spendCard}>
          <div className={styles.spendHeading}>
            <div>
              <span className={styles.metricLabel}>SPEND THIS CYCLE</span>
              <p className={styles.amountLine}>
                <strong>{formatUsdAtomic(policy.spend.committedAtomic)}</strong>
                <span>of {formatUsdCents(policy.cap.amountUsdCents)}</span>
                <b>{formatBasisPoints(committedBasisPoints)}</b>
              </p>
            </div>
            <span className={styles.frequency}>{formatCycleFrequency(policy.cap.frequency)}</span>
          </div>
          <div aria-label={capUsageDescription(policy)} className={styles.track} role="img">
            <span
              className={styles.settledFill}
              style={{ width: capFillWidth(policy.spend.settledFillBasisPoints ?? "0") }}
            />
            <span
              className={styles.pendingFill}
              style={{ width: capFillWidth(policy.spend.reservedFillBasisPoints ?? "0") }}
            />
            {hasOverage ? (
              <span
                className={styles.overageFill}
                style={{ width: capFillWidth(policy.spend.overageFillBasisPoints ?? "0") }}
              />
            ) : null}
          </div>
          <div className={styles.legend}>
            <span>
              <i className={styles.settledKey} />
              Settled
            </span>
            <span>
              <i className={styles.pendingKey} />
              Reserved / unsettled
            </span>
            {hasReserved ? (
              <strong>
                incl. {formatUsdAtomic(policy.spend.reservedAtomic)} reserved
                {BigInt(policy.spend.revertedAtomic) > BigInt(0)
                  ? ` · ${formatUsdAtomic(policy.spend.revertedAtomic)} matching reverted-call evidence`
                  : ""}
              </strong>
            ) : null}
          </div>
          <div className={styles.resetLine}>
            {policy.cycle.nextResetAt ? (
              <span>
                Next reset{" "}
                <time dateTime={policy.cycle.nextResetAt}>
                  {new Date(policy.cycle.nextResetAt).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "UTC",
                  })}{" "}
                  UTC
                </time>{" "}
                · {resetLabel(policy.cycle.nextResetAt, now)}
              </span>
            ) : (
              <span>No automatic reset. Use Reset cycle when you want a clean window.</span>
            )}
            <span>{blockedReceiptEvidence(policy.spend.blockedReceiptCount)}</span>
          </div>
          {hasOverage ? (
            <p className={styles.overageNote}>
              {formatUsdAtomic(policy.spend.overageAtomic)} over the current cap. Raise the cap or
              reset this cycle to resume payments.
            </p>
          ) : null}
        </article>
      ) : null}

      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label>
          <span>Amount (USD)</span>
          <input
            autoComplete="off"
            inputMode="decimal"
            onChange={(event) => setAmount(event.target.value)}
            placeholder="10.00"
            required
            value={amount}
          />
        </label>
        <label>
          <span>Reset frequency</span>
          <select
            onChange={(event) =>
              setFrequency(event.target.value as CapPolicyView["cap"]["frequency"])
            }
            value={frequency}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="never">No automatic reset</option>
          </select>
        </label>
        <div className={styles.actions}>
          <button disabled={status !== "idle"} type="submit">
            {status === "saving" ? "Saving…" : policy ? "Save changes" : "Create cap"}
          </button>
          {policy ? (
            <button
              className={styles.secondaryButton}
              disabled={status !== "idle"}
              onClick={() => void reset()}
              type="button"
            >
              {status === "resetting" ? "Resetting…" : "Reset cycle"}
            </button>
          ) : null}
        </div>
      </form>
      {success ? (
        <p className={styles.success} role="status">
          {success}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
