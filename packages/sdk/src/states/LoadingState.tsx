import { BUYER_COPY } from "../copy";
import { center, useTokens } from "../styles";

type Props = { label?: string };

export function LoadingState({ label = BUYER_COPY.loading }: Props) {
  const tokens = useTokens();
  return (
    <div aria-live="polite" style={{ ...center, color: tokens.muted, gap: 12, padding: "28px 0" }}>
      <svg aria-hidden="true" height="24" viewBox="0 0 24 24" width="24">
        <circle
          cx="12"
          cy="12"
          fill="none"
          opacity="0.35"
          r="9"
          stroke={tokens.border}
          strokeWidth="2"
        />
        <path
          d="M12 3a9 9 0 0 1 9 9"
          fill="none"
          stroke={tokens.accent}
          strokeLinecap="round"
          strokeWidth="2"
        >
          <animateTransform
            attributeName="transform"
            dur="0.8s"
            from="0 12 12"
            repeatCount="indefinite"
            to="360 12 12"
            type="rotate"
          />
        </path>
      </svg>
      <div style={{ fontSize: 13 }}>{label}</div>
    </div>
  );
}
