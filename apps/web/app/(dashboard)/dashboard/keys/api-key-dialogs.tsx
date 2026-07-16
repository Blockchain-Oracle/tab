"use client";

import { type FormEvent, type ReactNode, useState } from "react";

import type { ApiKeyPermissions } from "../../../../lib/auth/api-key";
import styles from "./api-key-dialogs.module.css";

interface DialogFrameProps {
  children: ReactNode;
  title: string;
}

function DialogFrame({ children, title }: DialogFrameProps) {
  return (
    <div className={styles.overlay}>
      <section
        aria-labelledby="key-dialog-title"
        aria-modal="true"
        className={styles.dialog}
        role="dialog"
      >
        <h2 id="key-dialog-title">{title}</h2>
        {children}
      </section>
    </div>
  );
}

interface CreateKeyDialogProps {
  error: string | null;
  isSubmitting: boolean;
  name: string;
  onClose: () => void;
  onNameChange: (name: string) => void;
  onPermissionChange: (permissions: ApiKeyPermissions) => void;
  onSubmit: () => void;
  permissions: ApiKeyPermissions;
}

export function CreateKeyDialog(props: CreateKeyDialogProps) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    props.onSubmit();
  }

  return (
    <DialogFrame title="Create API key">
      <form onSubmit={submit}>
        {props.error ? <p className={styles.dialogError}>{props.error}</p> : null}
        <label className={styles.fieldLabel} htmlFor="key-name">
          Key name <span>(optional)</span>
        </label>
        <input
          disabled={props.isSubmitting}
          id="key-name"
          maxLength={100}
          onChange={(event) => props.onNameChange(event.target.value)}
          placeholder="Production server"
          value={props.name}
        />
        <fieldset className={styles.permissionGroup} disabled={props.isSubmitting}>
          <legend>Permissions</legend>
          <label className={props.permissions === "full" ? styles.selectedPermission : undefined}>
            <input
              checked={props.permissions === "full"}
              name="permissions"
              onChange={() => props.onPermissionChange("full")}
              type="radio"
            />
            <span>
              <strong>Full access</strong>
              <small>Create payment intents and read payments.</small>
            </span>
          </label>
          <label
            className={props.permissions === "read_only" ? styles.selectedPermission : undefined}
          >
            <input
              checked={props.permissions === "read_only"}
              name="permissions"
              onChange={() => props.onPermissionChange("read_only")}
              type="radio"
            />
            <span>
              <strong>Read-only — list and read payments</strong>
              <small>Cannot create payment intents.</small>
            </span>
          </label>
        </fieldset>
        <div className={styles.dialogActions}>
          <button disabled={props.isSubmitting} onClick={props.onClose} type="button">
            Cancel
          </button>
          <button className={styles.primaryButton} disabled={props.isSubmitting} type="submit">
            {props.isSubmitting ? "Creating…" : "Create key"}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}

interface SecretRevealDialogProps {
  keyName: string;
  onClose: () => void;
  permissions: ApiKeyPermissions;
  secret: string;
}

export function SecretRevealDialog(props: SecretRevealDialogProps) {
  const [copied, setCopied] = useState(false);

  async function copySecret() {
    await navigator.clipboard.writeText(props.secret);
    setCopied(true);
  }

  return (
    <DialogFrame title="Your new secret key">
      <p className={styles.warning}>
        For security reasons, you can only view this key once. Save it to a secure location before
        closing this dialog.
      </p>
      <div className={styles.secretBox}>
        <code>{props.secret}</code>
        <button onClick={copySecret} type="button">
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <p className={styles.revealMeta}>
        {props.keyName} · {props.permissions === "full" ? "Full access" : "Read-only"}
      </p>
      <div className={styles.dialogActions}>
        <button className={styles.darkButton} onClick={props.onClose} type="button">
          I’ve saved my key
        </button>
      </div>
    </DialogFrame>
  );
}

interface ConfirmDialogProps {
  isSubmitting: boolean;
  keyName: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function RotationConfirmDialog(props: ConfirmDialogProps) {
  return (
    <DialogFrame title={`Rotate ${props.keyName}?`}>
      <p className={styles.confirmCopy}>
        The current key will stop working immediately. The replacement secret will be shown once.
      </p>
      <div className={styles.dialogActions}>
        <button disabled={props.isSubmitting} onClick={props.onClose} type="button">
          Cancel
        </button>
        <button
          className={styles.dangerButton}
          disabled={props.isSubmitting}
          onClick={props.onConfirm}
          type="button"
        >
          {props.isSubmitting ? "Rotating…" : "Rotate key"}
        </button>
      </div>
    </DialogFrame>
  );
}

export function DeleteConfirmDialog(props: ConfirmDialogProps) {
  return (
    <DialogFrame title={`Delete ${props.keyName}?`}>
      <p className={styles.confirmCopy}>
        This key will stop working immediately. Existing payment records are kept.
      </p>
      <div className={styles.dialogActions}>
        <button disabled={props.isSubmitting} onClick={props.onClose} type="button">
          Cancel
        </button>
        <button
          className={styles.dangerButton}
          disabled={props.isSubmitting}
          onClick={props.onConfirm}
          type="button"
        >
          {props.isSubmitting ? "Deleting…" : "Delete key"}
        </button>
      </div>
    </DialogFrame>
  );
}
