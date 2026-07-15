"use client";

import { type ClipboardEvent, type KeyboardEvent, useEffect, useRef } from "react";

import styles from "./auth-challenge.module.css";

type OtpInputProps = {
  describedBy?: string;
  disabled?: boolean;
  focusKey: string;
  invalid?: boolean;
  onChange: (value: string) => void;
  value: string;
};

function digitsOnly(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function OtpInput({
  describedBy,
  disabled = false,
  focusKey,
  invalid = false,
  onChange,
  value,
}: OtpInputProps) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const previousFocusKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!disabled && previousFocusKey.current !== focusKey) {
      inputs.current[0]?.focus();
    }
    previousFocusKey.current = focusKey;
  }, [disabled, focusKey]);

  function updateDigit(index: number, rawValue: string) {
    const digit = digitsOnly(rawValue).at(-1) ?? "";
    const next = value.split("");

    if (!digit) {
      next.splice(index, 1);
    } else if (index <= value.length) {
      next[index] = digit;
    }

    const normalized = digitsOnly(next.join(""));
    onChange(normalized);

    if (digit && index < 5) {
      inputs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !value[index] && index > 0) {
      event.preventDefault();
      onChange(value.slice(0, index - 1) + value.slice(index));
      inputs.current[index - 1]?.focus();
    } else if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      inputs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < 5) {
      event.preventDefault();
      inputs.current[index + 1]?.focus();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLFieldSetElement>) {
    const pasted = digitsOnly(event.clipboardData.getData("text"));
    if (!pasted) return;

    event.preventDefault();
    onChange(pasted);
    inputs.current[Math.min(pasted.length, 6) - 1]?.focus();
  }

  return (
    <fieldset aria-describedby={describedBy} className={styles.otpGroup} onPaste={handlePaste}>
      <legend className={styles.visuallyHidden}>Six-digit one-time code</legend>
      {(["first", "second", "third", "fourth", "fifth", "sixth"] as const).map(
        (position, index) => (
          <input
            aria-invalid={invalid || undefined}
            aria-label={`Code digit ${index + 1}`}
            autoComplete={index === 0 ? "one-time-code" : "off"}
            className={styles.otpInput}
            disabled={disabled}
            inputMode="numeric"
            key={position}
            maxLength={1}
            onChange={(event) => updateDigit(index, event.currentTarget.value)}
            onFocus={() => {
              if (index > value.length) inputs.current[value.length]?.focus();
            }}
            onKeyDown={(event) => handleKeyDown(index, event)}
            pattern="[0-9]*"
            ref={(element) => {
              inputs.current[index] = element;
            }}
            type="text"
            value={value[index] ?? ""}
          />
        ),
      )}
    </fieldset>
  );
}
