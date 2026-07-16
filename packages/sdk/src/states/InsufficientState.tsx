import { BUYER_COPY, buyerFormat } from "../copy";
import { center, colors, panel, primaryButton, quietButton } from "../styles";

type Props = {
  balance: string;
  onAddFunds(): void;
  onCancel(): void;
  shortfall: string;
};

export function InsufficientState({ balance, onAddFunds, onCancel, shortfall }: Props) {
  return (
    <div style={center}>
      <div style={{ fontSize: 17, fontWeight: 600 }}>{BUYER_COPY.insufficient.title}</div>
      <div style={{ ...panel, marginTop: 18 }}>
        <span style={{ color: colors.muted, fontSize: 13 }}>{BUYER_COPY.balance.label}</span>
        <strong style={{ fontSize: 13 }}>{buyerFormat.available(`$${balance}`)}</strong>
      </div>
      <div
        style={{
          background: colors.warningBackground,
          borderRadius: 10,
          color: colors.warning,
          fontSize: 12.5,
          lineHeight: 1.5,
          marginTop: 10,
          padding: "10px 12px",
          textAlign: "left",
          width: "100%",
        }}
      >
        <strong>{buyerFormat.short(`$${shortfall}`)}</strong>. {BUYER_COPY.insufficient.body}
      </div>
      <button onClick={onAddFunds} style={{ ...primaryButton, marginTop: 16 }} type="button">
        {BUYER_COPY.buttons.addFunds}
      </button>
      <button onClick={onCancel} style={{ ...quietButton, marginTop: 9 }} type="button">
        {BUYER_COPY.buttons.cancel}
      </button>
    </div>
  );
}
