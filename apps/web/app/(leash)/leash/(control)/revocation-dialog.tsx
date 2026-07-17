"use client";

import { type KeyboardEvent, type RefObject, useEffect, useRef, useState } from "react";

import { formatUsdAtomic } from "../../../../lib/leash/leash-format";
import { type RevocationAction, revocationDialogCopy } from "./revocation-copy";
import styles from "./revocation-dialog.module.css";
import { type LiveRead, parseLiveRead, readLabel } from "./revocation-live-read";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const LIVE_READ_TIMEOUT_MS = 8_000;

export function RevocationDialog({
  agent,
  error,
  fallbackFocus,
  kind,
  opener,
  pending,
  onClose,
  onSubmit,
}: {
  agent: { id: string; name: string };
  error: string | null;
  fallbackFocus: RefObject<HTMLElement | null>;
  kind: RevocationAction;
  opener: HTMLButtonElement | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (confirmation?: string) => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const dismissRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmation, setConfirmation] = useState("");
  const [liveRead, setLiveRead] = useState<LiveRead>({ state: "loading" });
  const [readAttempt, setReadAttempt] = useState(0);
  const readAttemptRef = useRef(readAttempt);
  readAttemptRef.current = readAttempt;

  useEffect(() => {
    (inputRef.current ?? dismissRef.current)?.focus();
    return () => {
      const target = opener?.isConnected && !opener.disabled ? opener : fallbackFocus.current;
      if (target?.isConnected) target.focus();
    };
  }, [fallbackFocus, opener]);

  useEffect(() => {
    if (kind !== "nuclear" && kind !== "cancel") return;
    const controller = new AbortController();
    let active = true;
    const currentAttempt = readAttempt;
    const isCurrent = () => active && readAttemptRef.current === currentAttempt;
    setLiveRead({ state: "loading" });
    const timeout = window.setTimeout(() => {
      if (!isCurrent()) return;
      controller.abort();
      setLiveRead({ state: "unavailable" });
    }, LIVE_READ_TIMEOUT_MS);
    fetch(`/api/leash/float-balances?agentId=${encodeURIComponent(agent.id)}`, {
      cache: "no-store",
      method: "GET",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return { state: "unavailable" } as LiveRead;
        return parseLiveRead(await response.json(), agent.id);
      })
      .then((read) => {
        if (isCurrent()) setLiveRead(read);
      })
      .catch(() => {
        if (isCurrent()) setLiveRead({ state: "unavailable" });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [agent.id, kind, readAttempt]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) return;
    if (
      event.shiftKey &&
      (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))
    ) {
      event.preventDefault();
      first.focus();
    }
  }

  const copy = revocationDialogCopy(kind, agent.name);
  const destructive = kind === "cancel" || kind === "nuclear";
  const liveReadReady = !destructive || liveRead.state === "available";
  return (
    <div className={styles.backdrop}>
      <section
        aria-describedby="revoke-dialog-consequences"
        aria-labelledby="revoke-dialog-title"
        aria-modal="true"
        className={styles.dialog}
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="alertdialog"
      >
        <span className={kind === "nuclear" ? styles.dangerMark : styles.warningMark}>
          {copy.mark}
        </span>
        <h2 id="revoke-dialog-title">{copy.title}</h2>
        <p className={styles.consequences} id="revoke-dialog-consequences">
          {copy.consequence}
        </p>
        {kind === "nuclear" || kind === "cancel" ? (
          <div className={styles.balanceWarning}>
            <span>LIVE REMAINING FLOAT</span>
            <strong>
              {liveRead.state === "loading"
                ? "Refreshing Base + Arbitrum…"
                : liveRead.state === "available"
                  ? formatUsdAtomic(liveRead.totalAtomic)
                  : "Live read unavailable"}
            </strong>
            {readLabel(liveRead) ? (
              <small className={styles.readHealth}>{readLabel(liveRead)}</small>
            ) : null}
            <p>
              {kind === "nuclear"
                ? "Funds can become stranded after destruction."
                : "B-03 has not established whether cancellation changes the signer address. If it does, floats can remain at the old address."}
            </p>
            <button
              className={`${styles.dialogButton} ${styles.withdrawButton}`}
              disabled
              type="button"
            >
              Withdraw first
            </button>
            <small>
              Funded spike B-04 is required before the pre-cancel or pre-destruction sweep can be
              enabled.
            </small>
            {liveRead.state !== "available" ? (
              <>
                <small>A verified live read is required before this control can be applied.</small>
                {liveRead.state === "unavailable" ? (
                  <button
                    className={styles.dialogButton}
                    disabled={pending}
                    onClick={() => setReadAttempt((attempt) => attempt + 1)}
                    type="button"
                  >
                    Retry live read
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <p className={styles.error} role="alert">
            {error} Review the consequence and retry when ready.
          </p>
        ) : null}
        {copy.confirmation ? (
          <label>
            Type <strong>{copy.confirmation}</strong> to confirm
            <input
              autoComplete="off"
              onChange={(event) => setConfirmation(event.target.value)}
              ref={inputRef}
              value={confirmation}
            />
          </label>
        ) : null}
        <div className={styles.dialogActions}>
          <button
            className={styles.dialogButton}
            disabled={pending}
            onClick={onClose}
            ref={dismissRef}
            type="button"
          >
            {copy.dismissLabel}
          </button>
          <button
            aria-busy={pending ? "true" : undefined}
            className={`${styles.dialogButton} ${destructive ? styles.confirmDanger : ""}`}
            disabled={
              pending ||
              !liveReadReady ||
              (copy.confirmation !== null && confirmation !== copy.confirmation)
            }
            onClick={() => onSubmit(copy.confirmation ? confirmation : undefined)}
            type="button"
          >
            {pending ? "Applying control…" : copy.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
