"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CANCEL_COPY_BY_SPIKE_OUTCOME, type RevocationAction } from "./revocation-copy";
import { RevocationDialog } from "./revocation-dialog";
import styles from "./revocation-panel.module.css";

type Status = "provisioned" | "paused" | "frozen" | "cancelled" | "nuked";

const statusLabel: Record<Status, string> = {
  cancelled: "Cancelled",
  frozen: "Frozen",
  nuked: "Not provisioned — destroyed",
  paused: "Paused",
  provisioned: "Active",
};

export function RevocationPanel({
  agent,
}: {
  agent: { id: string; name: string; status: Status };
}) {
  const router = useRouter();
  const fallbackFocusRef = useRef<HTMLHeadingElement>(null);
  const [status, setStatus] = useState(agent.status);
  const [dialog, setDialog] = useState<RevocationAction | null>(null);
  const [opener, setOpener] = useState<HTMLButtonElement | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function closeDialog() {
    if (pending) return;
    setDialog(null);
  }

  function openDialog(kind: RevocationAction, trigger: HTMLButtonElement) {
    setMessage(null);
    setOpener(trigger);
    setDialog(kind);
  }

  async function submit(action: RevocationAction, requiredConfirmation?: string) {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/leash/revoke", {
        body: JSON.stringify({
          action,
          agentId: agent.id,
          ...(requiredConfirmation === undefined ? {} : { confirmation: requiredConfirmation }),
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = (await response.json()) as {
        agentId?: string;
        error?: { message?: string };
        status?: Status;
      };
      if (!response.ok) throw new Error(body.error?.message ?? "The control change was rejected.");
      if (body.agentId !== agent.id || !body.status || !(body.status in statusLabel)) {
        throw new Error("The control response was incomplete.");
      }
      setStatus(body.status);
      setMessage(`${statusLabel[body.status]} control is now stored.`);
      setDialog(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The control change failed.");
    } finally {
      setPending(false);
    }
  }

  const pauseAction = status === "paused" ? "resume" : "pause";
  const pauseEnabled = status === "provisioned" || status === "paused";
  const freezeAction = status === "frozen" ? "unfreeze" : "freeze";
  const freezeEnabled = status === "provisioned" || status === "paused" || status === "frozen";

  return (
    <main className={styles.page}>
      <div
        aria-hidden={dialog ? "true" : undefined}
        className={styles.background}
        data-revocation-background
        inert={dialog ? true : undefined}
      >
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>REVOCATION SPECTRUM</p>
            <h1 data-revocation-focus-fallback ref={fallbackFocusRef} tabIndex={-1}>
              Control {agent.name}
            </h1>
            <p>Choose the narrowest control that matches the situation.</p>
          </div>
          <span className={`${styles.status} ${styles[status]}`}>{statusLabel[status]}</span>
        </header>

        <section aria-label="Revocation controls" className={styles.spectrum}>
          <article>
            <span className={styles.level}>LEVEL 1 · RESUMABLE</span>
            <h2>Pause payment signing</h2>
            <p>Your payments stop at Tab before signing. This does not stop your agent process.</p>
            <button
              className={styles.controlButton}
              disabled={!pauseEnabled || pending}
              onClick={(event) => openDialog(pauseAction, event.currentTarget)}
              type="button"
            >
              {pauseAction === "resume" ? "Resume payments" : "Pause payments"}
            </button>
          </article>

          <article>
            <span className={styles.level}>LEVEL 2 · RESUMABLE</span>
            <h2>Freeze the signer gate</h2>
            <p>
              The signer refuses every authorization while the stored credential remains intact.
            </p>
            <button
              className={styles.controlButton}
              disabled={!freezeEnabled || pending}
              onClick={(event) => openDialog(freezeAction, event.currentTarget)}
              type="button"
            >
              {freezeAction === "unfreeze" ? "Unfreeze signer" : "Freeze signer"}
            </button>
          </article>

          <article className={styles.warningCard}>
            <span className={styles.level}>LEVEL 3 · CREDENTIAL RESET</span>
            <h2>Cancel this credential</h2>
            <p>{CANCEL_COPY_BY_SPIKE_OUTCOME.unresolved}</p>
            <button
              className={styles.controlButton}
              disabled={status === "cancelled" || status === "nuked" || pending}
              onClick={(event) => openDialog("cancel", event.currentTarget)}
              type="button"
            >
              Cancel credential
            </button>
          </article>

          <article className={styles.dangerCard}>
            <span className={styles.level}>LEVEL 4 · IRREVERSIBLE</span>
            <h2>Nuclear destruction</h2>
            <p>Permanently destroys the signing credential. There is no recovery.</p>
            <button
              className={`${styles.controlButton} ${styles.dangerButton}`}
              disabled={status === "nuked" || pending}
              onClick={(event) => openDialog("nuclear", event.currentTarget)}
              type="button"
            >
              Destroy credential
            </button>
          </article>
        </section>

        {status === "cancelled" || status === "nuked" ? (
          <section className={styles.recovery} role="status">
            <div>
              <strong>
                {status === "nuked" ? "Signing credential destroyed" : "Credential cancelled"}
              </strong>
              <p>
                {status === "nuked"
                  ? "Leash withdrawal is unavailable after nuclear destruction. Remaining floats may be stranded."
                  : "Every Leash key is invalid. B-03 must clear before a replacement credential can be issued."}
              </p>
            </div>
            <Link href={`/leash/provision?agentId=${encodeURIComponent(agent.id)}`}>
              Provision new agent
            </Link>
          </section>
        ) : null}

        <p aria-live="polite" className={styles.message} role="status">
          {message}
        </p>
      </div>

      {dialog ? (
        <RevocationDialog
          agent={agent}
          error={message}
          fallbackFocus={fallbackFocusRef}
          kind={dialog}
          onClose={closeDialog}
          onSubmit={(confirmation) => submit(dialog, confirmation)}
          opener={opener}
          pending={pending}
        />
      ) : null}
    </main>
  );
}
