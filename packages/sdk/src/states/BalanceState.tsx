import { BUYER_COPY, buyerFormat } from "../copy";
import { BaseGlyph, UsdcGlyph } from "../marks";
import { center, monoFamily, panel, primaryButton, useTokens } from "../styles";

type Props = {
  amount: string;
  balance: string;
  merchantName: string;
  mode: "live" | "test";
  onConfirm(): void;
};

export function BalanceState({ amount, balance, merchantName, mode, onConfirm }: Props) {
  const tokens = useTokens();
  return (
    <div style={center}>
      <div style={{ fontFamily: monoFamily, fontSize: 38, fontWeight: 640, letterSpacing: -1 }}>
        ${amount}
      </div>
      <div style={{ color: tokens.muted, fontSize: 13, marginTop: 6 }}>
        {buyerFormat.toMerchant(merchantName)}
      </div>
      <div style={{ ...panel(tokens), marginTop: 20 }}>
        <span style={{ alignItems: "center", display: "flex", gap: 7 }}>
          <UsdcGlyph size={17} />
          <span style={{ color: tokens.muted, fontSize: 13 }}>{BUYER_COPY.balance.label}</span>
        </span>
        <strong style={{ fontFamily: monoFamily, fontSize: 13 }}>
          {buyerFormat.available(`$${balance}`)}
        </strong>
      </div>
      <div
        style={{
          alignItems: "center",
          color: tokens.muted,
          display: "flex",
          fontSize: 12,
          fontWeight: 550,
          gap: 6,
          marginTop: 10,
        }}
      >
        <BaseGlyph size={13} />
        {mode === "test" ? "Testnet" : "Live funds"}
      </div>
      <button onClick={onConfirm} style={{ ...primaryButton(tokens), marginTop: 16 }} type="button">
        {buyerFormat.pay(`$${amount}`)}
      </button>
    </div>
  );
}
