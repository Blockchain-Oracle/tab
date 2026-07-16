import { BUYER_COPY } from "../copy";
import { center, colors, quietButton } from "../styles";

type Props = { amount: string; onDone(): void; refCode: string };

export function SuccessState({ amount, onDone, refCode }: Props) {
  return (
    <div style={center}>
      <div
        aria-hidden="true"
        style={{
          alignItems: "center",
          background: "#E8F3EC",
          borderRadius: "50%",
          color: colors.green,
          display: "flex",
          fontSize: 28,
          height: 66,
          justifyContent: "center",
          width: 66,
        }}
      >
        ✓
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, marginTop: 16 }}>
        {BUYER_COPY.paymentComplete}
      </div>
      <div style={{ color: colors.muted, fontSize: 13, marginTop: 5 }}>${amount}</div>
      <div
        style={{
          background: "#F8F7F4",
          borderRadius: 8,
          color: colors.muted,
          fontFamily: "ui-monospace, monospace",
          fontSize: 12,
          marginTop: 14,
          padding: "7px 12px",
        }}
      >
        {BUYER_COPY.reference} #{refCode}
      </div>
      <button onClick={onDone} style={{ ...quietButton, marginTop: 16 }} type="button">
        {BUYER_COPY.buttons.done}
      </button>
    </div>
  );
}
