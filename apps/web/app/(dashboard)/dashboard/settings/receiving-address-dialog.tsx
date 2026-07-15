"use client";

import { useEffect, useRef } from "react";

import styles from "./settings-dialog.module.css";

type ReceivingAddressDialogProps = {
  address: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ReceivingAddressDialog({
  address,
  onCancel,
  onConfirm,
}: ReceivingAddressDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      aria-labelledby="receiving-address-title"
      className={styles.dialog}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      ref={dialogRef}
    >
      <h2 id="receiving-address-title">Change receiving address?</h2>
      <p>Future payments will settle directly to this address on Arbitrum One:</p>
      <code>{address}</code>
      <p>Tab cannot reverse a payment sent to the wrong address.</p>
      <div className={styles.actions}>
        <button onClick={onCancel} type="button">
          Cancel
        </button>
        <button className={styles.confirmButton} onClick={onConfirm} type="button">
          Confirm address
        </button>
      </div>
    </dialog>
  );
}
