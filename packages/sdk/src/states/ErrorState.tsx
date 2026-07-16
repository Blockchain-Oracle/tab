import { BUYER_COPY } from "../copy";
import { center, colors, primaryButton, quietButton } from "../styles";

type Props = {
  body: string;
  onCancel?: () => void;
  onRetry: (() => void) | undefined;
  title: string;
};

export function ErrorState({ body, onCancel, onRetry, title }: Props) {
  return (
    <div style={center}>
      <div
        aria-hidden="true"
        style={{
          alignItems: "center",
          background: "#FAECEC",
          borderRadius: "50%",
          color: "#B4383D",
          display: "flex",
          fontSize: 22,
          fontWeight: 600,
          height: 52,
          justifyContent: "center",
          width: 52,
        }}
      >
        !
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, marginTop: 14 }}>{title}</div>
      <div style={{ color: colors.muted, fontSize: 13, lineHeight: 1.55, marginTop: 7 }}>
        {body}
      </div>
      {onRetry ? (
        <button onClick={onRetry} style={{ ...primaryButton, marginTop: 18 }} type="button">
          {BUYER_COPY.buttons.retry}
        </button>
      ) : null}
      {onCancel ? (
        <button onClick={onCancel} style={{ ...quietButton, marginTop: 9 }} type="button">
          {BUYER_COPY.buttons.cancel}
        </button>
      ) : null}
    </div>
  );
}
