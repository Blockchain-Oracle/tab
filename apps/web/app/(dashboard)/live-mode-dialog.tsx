"use client";

import { useEffect, useRef } from "react";

import styles from "./live-mode-dialog.module.css";

type LiveModeDialogProps = {
  error: string | undefined;
  onCancel: () => void;
  onConfirm: () => void;
  switching: boolean;
};

export function LiveModeDialog({ error, onCancel, onConfirm, switching }: LiveModeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      aria-labelledby="live-mode-title"
      className={styles.dialog}
      onCancel={(event) => {
        event.preventDefault();
        if (!switching) onCancel();
      }}
      ref={dialogRef}
    >
      <h2 id="live-mode-title">Switch to Mainnet?</h2>
      <p>
        Mainnet payments move real funds and settle as USDC on Arbitrum One to your receiving
        address.
      </p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.actions}>
        <button disabled={switching} onClick={onCancel} type="button">
          Cancel
        </button>
        <button
          className={styles.liveButton}
          disabled={switching}
          onClick={onConfirm}
          type="button"
        >
          {switching ? "Switching…" : "Switch to Mainnet"}
        </button>
      </div>
    </dialog>
  );
}
