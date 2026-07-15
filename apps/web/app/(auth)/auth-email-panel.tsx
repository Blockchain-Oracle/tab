"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import styles from "./auth.module.css";
import { type AuthFlow, authCopy } from "./auth-copy";

type AuthEmailPanelProps = {
  configured: boolean;
  configurationMessage: string;
  email: string;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  flow: AuthFlow;
  onEmailChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  sending: boolean;
};

export function AuthEmailPanel({
  configured,
  configurationMessage,
  email,
  errorCode,
  errorMessage,
  flow,
  onEmailChange,
  onSubmit,
  sending,
}: AuthEmailPanelProps) {
  const copy = authCopy[flow];
  const hasValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const alternateErrorHref =
    errorCode === "EMAIL_ALREADY_REGISTERED"
      ? "/login"
      : errorCode === "EMAIL_NOT_REGISTERED"
        ? "/signup"
        : undefined;

  return (
    <div>
      <h1 className={styles.title}>{copy.title}</h1>
      <p className={styles.subtitle}>{copy.subtitle}</p>

      {!configured ? (
        <div className={styles.configBanner} role="status">
          {configurationMessage}
        </div>
      ) : null}

      <form className={styles.form} onSubmit={onSubmit}>
        <label className={styles.label} htmlFor={`${flow}-email`}>
          Email
        </label>
        <input
          aria-describedby={errorMessage ? `${flow}-email-error` : undefined}
          aria-invalid={Boolean(errorMessage) || undefined}
          autoComplete="email"
          className={styles.emailInput}
          disabled={!configured || sending}
          id={`${flow}-email`}
          name="email"
          onChange={(event) => onEmailChange(event.currentTarget.value)}
          placeholder="you@company.com"
          required
          type="email"
          value={email}
        />
        {errorMessage ? (
          <p className={styles.inlineError} id={`${flow}-email-error`} role="alert">
            {errorMessage}{" "}
            {alternateErrorHref ? (
              <Link href={alternateErrorHref}>
                {errorCode === "EMAIL_ALREADY_REGISTERED" ? "Log in instead." : "Sign up instead."}
              </Link>
            ) : null}
          </p>
        ) : null}
        <button
          className={styles.primaryButton}
          disabled={!configured || !hasValidEmail || sending}
          type="submit"
        >
          {sending ? "Sending code…" : copy.action}
        </button>
      </form>

      <p className={styles.alternate}>
        {copy.alternateLead} <Link href={copy.alternateHref}>{copy.alternateAction}</Link>
      </p>
    </div>
  );
}
