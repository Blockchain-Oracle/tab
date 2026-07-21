"use client";

import Link from "next/link";
import { useEffect } from "react";

import styles from "./error-panel.module.css";

interface ErrorPanelProps {
  error: Error & { digest?: string };
  reset: () => void;
  title: string;
  detail: string;
  moneyNote: string;
  homeHref?: string;
  homeLabel?: string;
}

export function ErrorPanel({
  error,
  reset,
  title,
  detail,
  moneyNote,
  homeHref,
  homeLabel,
}: ErrorPanelProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className={styles.page}>
      <section aria-labelledby="error-panel-title" className={styles.panel}>
        <p aria-hidden="true" className={styles.mark}>
          !
        </p>
        <h1 className={styles.title} id="error-panel-title">
          {title}
        </h1>
        <p className={styles.detail}>{detail}</p>
        <p className={styles.moneyNote}>{moneyNote}</p>
        {error.digest ? (
          <p className={styles.digest}>
            Reference code: <code>{error.digest}</code>
          </p>
        ) : null}
        <div className={styles.actions}>
          <button className={styles.retry} onClick={reset} type="button">
            Try again
          </button>
          {homeHref ? (
            <Link className={styles.home} href={homeHref}>
              {homeLabel ?? "Go to home"}
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
