"use client";

import baseStyles from "./auth.module.css";
import styles from "./auth-challenge.module.css";
import type { AuthState } from "./auth-state";
import { OtpInput } from "./otp-input";
import { useResendCooldown } from "./use-resend-cooldown";

type AuthChallengePanelProps = {
  email: string;
  notice?: string | undefined;
  onBack: () => void;
  onChange: (otp: string) => void;
  onResend: () => void;
  state: AuthState;
};

function MailIcon() {
  return (
    <div className={styles.mailIcon} aria-hidden="true">
      <svg fill="none" height="20" viewBox="0 0 24 24" width="20">
        <title>Mail</title>
        <path
          d="M4 6.75h16v10.5H4V6.75Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.6"
        />
        <path d="m4.5 7.25 7.5 5.5 7.5-5.5" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    </div>
  );
}

export function AuthChallengePanel({
  email,
  notice,
  onBack,
  onChange,
  onResend,
  state,
}: AuthChallengePanelProps) {
  const cooldown = useResendCooldown(30);
  const isVerifying = state.stage === "verifying";
  const isLimited = state.stage === "limited";
  const resend = () => {
    cooldown.arm();
    onResend();
  };
  const feedback =
    state.stage === "wrong"
      ? { kind: "error", text: "That code didn’t match. Try again." }
      : state.stage === "expired"
        ? { kind: "error", text: "This code has expired. Resend to get a new code." }
        : isLimited
          ? {
              kind: "warning",
              text: "Magic has temporarily limited this login. Try again later.",
            }
          : notice
            ? { kind: "notice", text: notice }
            : undefined;

  return (
    <div>
      <button className={styles.backButton} disabled={isVerifying} onClick={onBack} type="button">
        <span aria-hidden="true">←</span> Back
      </button>
      <div className={styles.challengeHeading}>
        <MailIcon />
        <h1 className={baseStyles.title}>Check your email</h1>
        <p className={baseStyles.subtitle}>
          Enter the code we sent to <strong>{email}</strong>
        </p>
      </div>

      {feedback ? (
        <div
          className={feedback.kind === "error" ? baseStyles.errorBanner : baseStyles.noticeBanner}
          id="otp-feedback"
          role={feedback.kind === "error" ? "alert" : "status"}
        >
          {feedback.text}
        </div>
      ) : null}

      <OtpInput
        describedBy={feedback ? "otp-feedback" : "otp-help"}
        disabled={isVerifying || isLimited}
        focusKey={state.stage}
        invalid={state.stage === "wrong" || state.stage === "expired"}
        onChange={onChange}
        value={state.otp}
      />

      <div className={styles.challengeAction} aria-live="polite">
        {isVerifying ? (
          <span className={styles.verifying}>
            <span className={styles.smallSpinner} aria-hidden="true" /> Verifying…
          </span>
        ) : isLimited ? null : cooldown.coolingDown ? (
          <span>
            Resend in <span className={styles.countdown}>{cooldown.secondsLeft}s</span>
          </span>
        ) : (
          <span>
            Didn’t get it?{" "}
            <button className={styles.textButton} onClick={resend} type="button">
              Resend code
            </button>
          </span>
        )}
      </div>
      <p className={styles.otpHelp} id="otp-help">
        Codes auto-submit on the 6th digit
      </p>
    </div>
  );
}
