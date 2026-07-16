import { useState } from "react";

import styles from "./webhook-dialog.module.css";

export function SecretRevealDialog({ onClose, secret }: { onClose: () => void; secret: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
  }

  return (
    <div className={styles.overlay} role="presentation">
      <div aria-modal="true" className={styles.dialog} role="dialog">
        <h2>Your signing secret</h2>
        <p className={styles.warning}>
          For security reasons, you can only view this signing secret once. Save it to a secure
          location.
        </p>
        <div className={styles.secretReveal}>
          <code>{secret}</code>
          <button onClick={() => void copy()} type="button">
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p>
          Verify every delivery by checking <code>X-Tab-Signature</code> with this secret.
        </p>
        <div className={styles.dialogActions}>
          <button className={styles.savedButton} onClick={onClose} type="button">
            I’ve saved my secret
          </button>
        </div>
      </div>
    </div>
  );
}
