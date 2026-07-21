import { Dialog } from "@tab/ui";
import { useState } from "react";

import styles from "./webhook-dialog.module.css";

export function SecretRevealDialog({ onClose, secret }: { onClose: () => void; secret: string }) {
  const [copyState, setCopyState] = useState<"copied" | "failed" | "idle">("idle");

  async function copy() {
    // A rejected clipboard write must never look like success: the secret is
    // shown exactly once, so a silent failure here loses it forever.
    try {
      await navigator.clipboard.writeText(secret);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <Dialog onDismiss={() => {}} open title="Your signing secret">
      <div className={styles.dialogBody}>
        <p className={styles.warning}>
          For security reasons, you can only view this signing secret once. Save it to a secure
          location.
        </p>
        <div className={styles.secretReveal}>
          <code style={{ userSelect: "all" }}>{secret}</code>
          <button onClick={() => void copy()} type="button">
            {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy again" : "Copy"}
          </button>
        </div>
        {copyState === "failed" ? (
          <p className={styles.warning} role="alert">
            Copy didn’t work. Select the secret above and copy it manually before closing.
          </p>
        ) : null}
        <p>
          Verify every delivery by checking <code>X-Tab-Signature</code> with this secret.
        </p>
        <div className={styles.dialogActions}>
          <button className={styles.savedButton} onClick={onClose} type="button">
            I’ve saved my secret
          </button>
        </div>
      </div>
    </Dialog>
  );
}
