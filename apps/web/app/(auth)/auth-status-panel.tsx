"use client";

import styles from "./auth.module.css";

type AuthStatusPanelProps = {
  body: string;
  kind: "device" | "error" | "success";
  onBack?: () => void;
  title: string;
};

export function AuthStatusPanel({ body, kind, onBack, title }: AuthStatusPanelProps) {
  return (
    <div className={styles.statusPanel}>
      <div className={`${styles.statusIcon} ${styles[kind]}`} aria-hidden="true">
        {kind === "success" ? "✓" : kind === "error" ? "!" : "✉"}
      </div>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.subtitle}>{body}</p>
      {onBack ? (
        <button className={styles.secondaryButton} onClick={onBack} type="button">
          Back to email
        </button>
      ) : null}
    </div>
  );
}
