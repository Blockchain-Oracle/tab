import { type ClipboardEvent, type FormEvent, useEffect, useRef } from "react";

import type { CheckoutStage } from "../checkout-state";
import { BUYER_COPY, buyerFormat } from "../copy";
import { center, colors, field, primaryButton, quietButton } from "../styles";

export type OtpIssue = "expired" | "invalid" | "rate-limited" | undefined;

type Props = {
  cooldownActive: boolean;
  email: string;
  issue: OtpIssue;
  onEmailChange(value: string): void;
  onEmailSubmit(): void;
  onOtpChange(value: string): void;
  onOtpComplete(value: string): void;
  onStartOver(): void;
  otp: string;
  stage: CheckoutStage;
};

function maskedEmail(email: string) {
  const [local = "", domain = ""] = email.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return domain ? `${visible}•••@${domain}` : email;
}

export function AuthState(props: Props) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const isEmail = props.stage === "email" || props.stage === "email-sending";
  useEffect(() => {
    if (!isEmail) refs.current[0]?.focus();
  }, [isEmail]);
  if (isEmail) {
    const sending = props.stage === "email-sending";
    const blocked = sending || props.cooldownActive;
    const submit = (event: FormEvent) => {
      event.preventDefault();
      if (!blocked) props.onEmailSubmit();
    };
    return (
      <form onSubmit={submit} style={{ ...center, gap: 8 }}>
        <div style={{ fontSize: 17, fontWeight: 600 }}>{BUYER_COPY.auth.emailTitle}</div>
        <div style={{ color: colors.muted, fontSize: 13, lineHeight: 1.5 }}>
          {BUYER_COPY.auth.emailBody}
        </div>
        <label style={{ marginTop: 14, width: "100%" }}>
          <span style={{ position: "absolute", transform: "translateX(-10000px)" }}>
            {BUYER_COPY.auth.emailLabel}
          </span>
          <input
            aria-label={BUYER_COPY.auth.emailLabel}
            autoComplete="email"
            disabled={sending}
            onChange={(event) => props.onEmailChange(event.currentTarget.value)}
            required
            style={field}
            type="email"
            value={props.email}
          />
        </label>
        <button
          disabled={blocked || !props.email.trim()}
          style={{ ...primaryButton, marginTop: 2, opacity: blocked ? 0.85 : 1 }}
          type="submit"
        >
          {sending ? BUYER_COPY.auth.sending : BUYER_COPY.buttons.continue}
        </button>
      </form>
    );
  }

  const verifying = props.stage === "otp-verifying";
  const digits = Array.from({ length: 6 }, (_, index) => props.otp[index] ?? "");
  const updateDigit = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    const code = next.join("");
    props.onOtpChange(code);
    if (digit && index < 5) refs.current[index + 1]?.focus();
    if (code.length === 6) props.onOtpComplete(code);
  };
  const paste = (event: ClipboardEvent<HTMLInputElement>) => {
    const code = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (code.length !== 6) return;
    event.preventDefault();
    props.onOtpChange(code);
    refs.current[5]?.focus();
    props.onOtpComplete(code);
  };
  const issueCopy = props.issue
    ? BUYER_COPY.auth[props.issue === "rate-limited" ? "rateLimited" : props.issue]
    : undefined;
  return (
    <div style={{ ...center, gap: 8 }}>
      <div style={{ fontSize: 17, fontWeight: 600 }}>{BUYER_COPY.auth.otpTitle}</div>
      <div style={{ color: colors.muted, fontSize: 13 }}>
        {BUYER_COPY.auth.codeSent} <strong>{maskedEmail(props.email)}</strong>
      </div>
      {issueCopy ? (
        <div
          style={{
            background: "#FAECEC",
            borderRadius: 10,
            color: "#8E2F34",
            fontSize: 12.5,
            padding: "9px 12px",
            width: "100%",
          }}
        >
          {issueCopy}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 7, justifyContent: "center", marginTop: 10 }}>
        {digits.map((digit, index) => (
          <input
            aria-label={buyerFormat.codeDigit(index + 1)}
            autoComplete={index === 0 ? "one-time-code" : "off"}
            disabled={verifying || props.issue === "rate-limited"}
            inputMode="numeric"
            key={buyerFormat.codeDigit(index + 1)}
            maxLength={1}
            onChange={(event) => updateDigit(index, event.currentTarget.value)}
            onPaste={paste}
            ref={(element) => {
              refs.current[index] = element;
            }}
            style={{
              ...field,
              fontSize: 20,
              height: 52,
              padding: 0,
              textAlign: "center",
              width: 42,
            }}
            value={digit}
          />
        ))}
      </div>
      <div aria-live="polite" style={{ color: colors.muted, fontSize: 12.5, marginTop: 4 }}>
        {verifying ? BUYER_COPY.auth.verifying : BUYER_COPY.auth.codeHint}
      </div>
      {props.issue === "expired" || props.issue === "rate-limited" ? (
        <button
          disabled={props.cooldownActive}
          onClick={props.onStartOver}
          style={{ ...quietButton, marginTop: 7, opacity: props.cooldownActive ? 0.6 : 1 }}
          type="button"
        >
          {BUYER_COPY.auth.startOver}
        </button>
      ) : null}
    </div>
  );
}
