import { BUYER_COPY } from "../copy";
import { center, primaryButton, quietButton, useTokens } from "../styles";

type Props = {
  body: string;
  onCancel?: () => void;
  onRetry: (() => void) | undefined;
  title: string;
};

export function ErrorState({ body, onCancel, onRetry, title }: Props) {
  const tokens = useTokens();
  return (
    <div style={center}>
      <div
        aria-hidden="true"
        style={{
          alignItems: "center",
          background: "#FAECEA",
          borderRadius: 999,
          color: "#B3382F",
          display: "flex",
          fontSize: 22,
          fontWeight: 620,
          height: 52,
          justifyContent: "center",
          width: 52,
        }}
      >
        !
      </div>
      <div style={{ fontSize: 17, fontWeight: 620, marginTop: 14 }}>{title}</div>
      <div style={{ color: tokens.muted, fontSize: 13, lineHeight: 1.55, marginTop: 7 }}>
        {body}
      </div>
      {onRetry ? (
        <button onClick={onRetry} style={{ ...primaryButton(tokens), marginTop: 18 }} type="button">
          {BUYER_COPY.buttons.retry}
        </button>
      ) : null}
      {onCancel ? (
        <button onClick={onCancel} style={{ ...quietButton(tokens), marginTop: 9 }} type="button">
          {BUYER_COPY.buttons.cancel}
        </button>
      ) : null}
    </div>
  );
}
