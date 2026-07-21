import type { Ref } from "react";

import { BUYER_COPY, buyerFormat } from "../copy";
import { TabGlyph } from "../marks";
import { primaryButton, useTokens } from "../styles";

type Props = {
  amount: string | undefined;
  buttonRef: Ref<HTMLButtonElement>;
  disabled: boolean;
  onClick(): void;
};

/** The PayButton itself: Tab's tally mark + the amount, as an ink pill. */
export function IdleState({ amount, buttonRef, disabled, onClick }: Props) {
  const tokens = useTokens();
  const label = amount ? buyerFormat.pay(`$${amount}`) : BUYER_COPY.loading;
  const base = primaryButton(tokens);
  return (
    <button
      aria-busy={disabled}
      disabled={disabled}
      onClick={onClick}
      ref={buttonRef}
      style={{
        ...base,
        background: disabled ? tokens.inkSoft : base.background,
        cursor: disabled ? "default" : "pointer",
        gap: 9,
        opacity: disabled ? 0.85 : 1,
      }}
      type="button"
    >
      <TabGlyph size={14} />
      {label}
    </button>
  );
}
