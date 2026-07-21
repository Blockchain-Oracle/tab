"use client";

import styles from "./auth.module.css";
import challengeStyles from "./auth-challenge.module.css";
import resumeStyles from "./auth-resume.module.css";

type Props = { email: string | undefined; onDismiss(): void };

/** "Welcome back" interstitial while a persisted session verifies. */
export function AuthResumePanel({ email, onDismiss }: Props) {
  return (
    <div aria-live="polite" className={styles.statusPanel} role="status">
      <span aria-hidden="true" className={challengeStyles.smallSpinner} />
      <h1 className={styles.title}>Welcome back</h1>
      <p className={styles.subtitle}>
        Resuming your session
        {email ? (
          <>
            {" "}
            as <strong>{email}</strong>
          </>
        ) : null}
        …
      </p>
      <span aria-hidden="true" className={resumeStyles.underline} />
      <p className={styles.alternate}>
        <button className={styles.textButton} onClick={onDismiss} type="button">
          Not you? Use a different email
        </button>
      </p>
    </div>
  );
}
