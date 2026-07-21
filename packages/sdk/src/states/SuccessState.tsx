import { BUYER_COPY } from "../copy";
import { center, monoFamily, quietButton, useTokens } from "../styles";

type Props = { amount: string; mode: "live" | "test"; onDone(): void; refCode: string };

/**
 * The receipt moment. The stamp says exactly what is true: a settled
 * simulated test payment, or a submitted live payment whose independent
 * verification continues elsewhere. Submitted is never presented as settled.
 */
export function SuccessState({ amount, mode, onDone, refCode }: Props) {
  const tokens = useTokens();
  const stampLabel = mode === "test" ? "Settled · Test" : "Submitted";
  return (
    <div style={center}>
      <div
        style={{
          background: tokens.canvas,
          border: `1px solid ${tokens.border}`,
          borderRadius: 10,
          padding: "20px 18px 46px",
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            display: "grid",
            fontFamily: monoFamily,
            fontSize: 12.5,
            gap: 9,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: tokens.muted, textTransform: "uppercase" }}>amount</span>
            <strong>${amount}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: tokens.muted, textTransform: "uppercase" }}>
              {BUYER_COPY.reference}
            </span>
            <span>#{refCode}</span>
          </div>
        </div>
        <span
          aria-hidden="true"
          style={{
            animation: "tab-stamp-land 360ms cubic-bezier(0.22, 1, 0.36, 1) both",
            border: `2.5px solid ${tokens.verified}`,
            borderRadius: 8,
            bottom: 12,
            color: tokens.verified,
            fontFamily: monoFamily,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.14em",
            padding: "5px 10px",
            position: "absolute",
            right: 12,
            textTransform: "uppercase",
            transform: "rotate(-3deg)",
          }}
        >
          {stampLabel}
        </span>
        <style>{`
          @keyframes tab-stamp-land {
            from { opacity: 0; transform: scale(1.18) rotate(-6deg); }
            to { opacity: 1; transform: scale(1) rotate(-3deg); }
          }
          @media (prefers-reduced-motion: reduce) {
            [aria-hidden] { animation: none !important; }
          }
        `}</style>
      </div>
      <div style={{ fontSize: 19, fontWeight: 620, marginTop: 16 }}>
        {BUYER_COPY.paymentComplete}
      </div>
      <button onClick={onDone} style={{ ...quietButton(tokens), marginTop: 14 }} type="button">
        {BUYER_COPY.buttons.done}
      </button>
    </div>
  );
}
