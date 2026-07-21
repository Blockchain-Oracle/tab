"use client";

import { useState } from "react";

import type { LeashKeyView } from "../../../../lib/leash/leash-key-view";
import styles from "./key-lifecycle.module.css";

type KeyResponse = { error?: { message?: string }; key?: LeashKeyView; secret?: string };

function maskedKey(key: LeashKeyView) {
  return `${key.prefix}••••••••${key.last4}`;
}

export function KeyLifecycle({
  agentId,
  initialKey,
  onKeyChange,
}: {
  agentId: string;
  initialKey: LeashKeyView | null;
  onKeyChange?: (key: LeashKeyView) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmingRotation, setConfirmingRotation] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string>();
  const [key, setKey] = useState(initialKey);
  const [secret, setSecret] = useState<string>();

  async function lifecycle(method: "PATCH" | "POST") {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    setCopied(false);
    try {
      const response = await fetch("/api/leash/keys", {
        body: JSON.stringify(method === "PATCH" ? { agentId, keyId: key?.id } : { agentId }),
        headers: { "content-type": "application/json" },
        method,
      });
      const body = (await response.json()) as KeyResponse;
      if (!response.ok || !body.key || !body.secret) {
        throw new Error(body.error?.message ?? "The Leash key was not created.");
      }
      setKey(body.key);
      onKeyChange?.(body.key);
      setSecret(body.secret);
      setConfirmingRotation(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The Leash key was not created.");
    } finally {
      setBusy(false);
    }
  }

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setError("Copy was blocked. Select and copy the key manually.");
    }
  }

  return (
    <section className={styles.card}>
      <div className={styles.heading}>
        <div>
          <span>1</span>
          <h2>Your Leash key</h2>
        </div>
        {key && !secret ? (
          <button disabled={busy} onClick={() => setConfirmingRotation(true)} type="button">
            Rotate key
          </button>
        ) : null}
      </div>

      {!key ? (
        <div className={styles.empty}>
          <p>
            No key exists yet. The generated secret is shown once and only its SHA-256 hash is
            stored.
          </p>
          <button disabled={busy} onClick={() => void lifecycle("POST")} type="button">
            {busy ? "Generating…" : "Generate Leash key"}
          </button>
        </div>
      ) : null}

      {key && !secret ? (
        <div className={styles.masked}>
          <code>{maskedKey(key)}</code>
          <span className={styles.maskedHelp}>
            Stored as a hash. The full key cannot be revealed again.
          </span>
        </div>
      ) : null}

      {secret ? (
        <div className={styles.reveal}>
          <p>
            <strong>Save this key now.</strong> It cannot be recovered after you close this view.
          </p>
          <div>
            <code>{secret}</code>
            <button onClick={() => void copySecret()} type="button">
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button className={styles.savedButton} onClick={() => setSecret(undefined)} type="button">
            I’ve saved my key
          </button>
        </div>
      ) : null}

      {confirmingRotation ? (
        <div aria-labelledby="rotate-key-title" className={styles.confirm} role="alertdialog">
          <h3 id="rotate-key-title">Rotate this key?</h3>
          <p>The current key stops working immediately. Update your agent with the replacement.</p>
          <div>
            <button disabled={busy} onClick={() => setConfirmingRotation(false)} type="button">
              Cancel
            </button>
            <button disabled={busy} onClick={() => void lifecycle("PATCH")} type="button">
              {busy ? "Rotating…" : "Rotate key"}
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
