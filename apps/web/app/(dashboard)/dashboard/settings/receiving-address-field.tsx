"use client";

import { useState } from "react";

import styles from "./settings-form.module.css";

type ReceivingAddressFieldProps = {
  editing: boolean;
  onCancel: () => void;
  onChange: (value: string) => void;
  onEdit: () => void;
  receivingAddress: string;
  source: "custom" | "magic_default";
};

export function ReceivingAddressField({
  editing,
  onCancel,
  onChange,
  onEdit,
  receivingAddress,
  source,
}: ReceivingAddressFieldProps) {
  const [copyStatus, setCopyStatus] = useState<"copied" | "error">();

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(receivingAddress);
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus(undefined), 2_000);
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <div className={styles.field}>
      <label htmlFor="receiving-address">Receiving address</label>
      {editing ? (
        <>
          <input
            aria-describedby="receiving-address-help"
            autoComplete="off"
            className={styles.addressInput}
            id="receiving-address"
            onChange={(event) => onChange(event.target.value)}
            spellCheck="false"
            value={receivingAddress}
          />
          <div className={styles.inlineActions}>
            <button onClick={onCancel} type="button">
              Cancel change
            </button>
          </div>
        </>
      ) : (
        <div className={styles.addressField}>
          <code>{receivingAddress}</code>
          <div>
            <button onClick={() => void copyAddress()} type="button">
              {copyStatus === "copied" ? "Copied" : "Copy"}
            </button>
            <button onClick={onEdit} type="button">
              Change
            </button>
          </div>
        </div>
      )}
      <small id="receiving-address-help">
        {source === "magic_default" ? "Default from your Magic wallet. " : "Custom address. "}
        Payments settle here; it must match the receiver in your intent endpoint.
      </small>
      {copyStatus === "error" ? (
        <small className={styles.inlineError} role="alert">
          Couldn’t copy the address.
        </small>
      ) : null}
    </div>
  );
}
