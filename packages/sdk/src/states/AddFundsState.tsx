import { useState } from "react";

import { BUYER_COPY } from "../copy";
import { center, monoFamily, primaryButton, quietButton, useTokens } from "../styles";

type Props = { address: string; mode: "live" | "test"; onCancel(): void; onRecheck(): void };

export function AddFundsState({ address, mode, onCancel, onRecheck }: Props) {
  const tokens = useTokens();
  const [copyStatus, setCopyStatus] = useState<"copied" | "failed" | "idle">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };
  return (
    <div style={center}>
      <div style={{ fontSize: 17, fontWeight: 620 }}>{BUYER_COPY.addFunds.title}</div>
      <div style={{ color: tokens.muted, fontSize: 13, lineHeight: 1.5, marginTop: 7 }}>
        {mode === "test"
          ? "Send test USDC to this address. Sandbox funds — no real value."
          : BUYER_COPY.addFunds.body}
      </div>
      <div
        style={{
          background: tokens.pale,
          border: `1px solid ${tokens.border}`,
          borderRadius: 10,
          fontFamily: monoFamily,
          fontSize: 12,
          lineHeight: 1.5,
          marginTop: 16,
          overflowWrap: "anywhere",
          padding: 12,
          userSelect: "all",
          width: "100%",
        }}
      >
        {address}
      </div>
      <button onClick={copy} style={{ ...quietButton(tokens), marginTop: 10 }} type="button">
        {copyStatus === "copied" ? BUYER_COPY.addFunds.copied : BUYER_COPY.addFunds.copy}
      </button>
      {copyStatus === "failed" ? (
        <div role="status" style={{ color: tokens.amber, fontSize: 12, marginTop: 7 }}>
          {BUYER_COPY.addFunds.copyFailed}
        </div>
      ) : null}
      <button onClick={onRecheck} style={{ ...primaryButton(tokens), marginTop: 10 }} type="button">
        {BUYER_COPY.addFunds.recheck}
      </button>
      <button onClick={onCancel} style={{ ...quietButton(tokens), marginTop: 9 }} type="button">
        {BUYER_COPY.buttons.cancel}
      </button>
    </div>
  );
}
