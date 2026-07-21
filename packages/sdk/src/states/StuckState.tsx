import { BUYER_COPY } from "../copy";
import { center, quietButton, useTokens } from "../styles";

type Props = { onClose(): void };

/**
 * The confirming stage exceeded its expected duration. Honest state: money
 * may be in flight, so no retry is offered here — only a safe close that
 * points the buyer at their receipt.
 */
export function StuckState({ onClose }: Props) {
  const tokens = useTokens();
  return (
    <div role="status" style={{ ...center, gap: 8 }}>
      <div style={{ fontSize: 17, fontWeight: 620 }}>{BUYER_COPY.stuck.title}</div>
      <div
        style={{
          background: tokens.amberBackground,
          borderRadius: 10,
          color: tokens.amber,
          fontSize: 12.5,
          lineHeight: 1.55,
          padding: "10px 12px",
          textAlign: "left",
          width: "100%",
        }}
      >
        {BUYER_COPY.stuck.body}
      </div>
      <button onClick={onClose} style={{ ...quietButton(tokens), marginTop: 12 }} type="button">
        {BUYER_COPY.stuck.close}
      </button>
    </div>
  );
}
