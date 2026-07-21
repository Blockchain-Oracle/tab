"use client";

import type { FormEvent } from "react";

import styles from "../../(auth)/auth.module.css";

type LeashAuthEmailPanelProps = {
  configured: boolean;
  configurationMessage: string;
  email: string;
  errorMessage?: string | undefined;
  onEmailChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  sending: boolean;
};

export function LeashAuthEmailPanel(props: LeashAuthEmailPanelProps) {
  const hasValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(props.email.trim());

  return (
    <div>
      <h1 className={styles.title}>Log in to Tab</h1>
      <p className={styles.subtitle}>
        A trusted browser signs in instantly. Otherwise, Magic emails a one-time code.
      </p>

      {!props.configured ? (
        <div className={styles.configBanner} role="status">
          {props.configurationMessage}
        </div>
      ) : null}

      <form className={styles.form} onSubmit={props.onSubmit}>
        <label className={styles.label} htmlFor="leash-owner-email">
          Email
        </label>
        <input
          aria-describedby={props.errorMessage ? "leash-owner-email-error" : undefined}
          aria-invalid={Boolean(props.errorMessage) || undefined}
          autoComplete="email"
          className={styles.emailInput}
          disabled={!props.configured || props.sending}
          id="leash-owner-email"
          name="email"
          onChange={(event) => props.onEmailChange(event.currentTarget.value)}
          placeholder="you@example.com"
          required
          type="email"
          value={props.email}
        />
        {props.errorMessage ? (
          <p className={styles.inlineError} id="leash-owner-email-error" role="alert">
            {props.errorMessage}
          </p>
        ) : null}
        <button
          className={styles.primaryButton}
          disabled={!props.configured || !hasValidEmail || props.sending}
          type="submit"
        >
          {props.sending ? "Checking…" : "Continue"}
        </button>
      </form>

      <p className={styles.alternate}>
        New here? Your owner profile is created after verification.
      </p>
    </div>
  );
}
