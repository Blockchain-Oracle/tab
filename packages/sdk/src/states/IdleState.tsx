import type { Ref } from "react";

import { BUYER_COPY, buyerFormat } from "../copy";
import { primaryButton } from "../styles";

type Props = {
  amount: string | undefined;
  buttonRef: Ref<HTMLButtonElement>;
  disabled: boolean;
  onClick(): void;
};

export function IdleState({ amount, buttonRef, disabled, onClick }: Props) {
  const label = amount ? buyerFormat.pay(`$${amount}`) : BUYER_COPY.loading;
  return (
    <button
      aria-busy={disabled}
      disabled={disabled}
      onClick={onClick}
      ref={buttonRef}
      style={{
        ...primaryButton,
        background: disabled ? "#33312C" : primaryButton.background,
        cursor: disabled ? "default" : "pointer",
        gap: 8,
        opacity: disabled ? 0.86 : 1,
      }}
      type="button"
    >
      <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 14 14" width="14">
        <rect height="7" rx="1.5" stroke="currentColor" width="10" x="2" y="6" />
        <path d="M4.5 6V4a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" />
      </svg>
      {label}
    </button>
  );
}
