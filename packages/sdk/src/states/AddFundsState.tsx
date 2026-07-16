import { useState } from "react";

import { BUYER_COPY } from "../copy";
import { center, colors, primaryButton, quietButton } from "../styles";

type Props = { address: string; onCancel(): void; onRecheck(): void };

export function AddFundsState({ address, onCancel, onRecheck }: Props) {
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
      <div style={{ fontSize: 17, fontWeight: 600 }}>{BUYER_COPY.addFunds.title}</div>
      <div style={{ color: colors.muted, fontSize: 13, lineHeight: 1.5, marginTop: 7 }}>
        {BUYER_COPY.addFunds.body}
      </div>
      <div
        style={{
          background: "#F8F7F4",
          borderRadius: 10,
          fontFamily: "ui-monospace, monospace",
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
      <button onClick={copy} style={{ ...quietButton, marginTop: 10 }} type="button">
        {copyStatus === "copied" ? BUYER_COPY.addFunds.copied : BUYER_COPY.addFunds.copy}
      </button>
      {copyStatus === "failed" ? (
        <div role="status" style={{ color: colors.warning, fontSize: 12, marginTop: 7 }}>
          {BUYER_COPY.addFunds.copyFailed}
        </div>
      ) : null}
      <button onClick={onRecheck} style={{ ...primaryButton, marginTop: 10 }} type="button">
        {BUYER_COPY.addFunds.recheck}
      </button>
      <button onClick={onCancel} style={{ ...quietButton, marginTop: 9 }} type="button">
        {BUYER_COPY.buttons.cancel}
      </button>
    </div>
  );
}
