import { BUYER_COPY } from "../copy";
import { center, quietButton, useTokens } from "../styles";

type Props = { email: string; onStartOver(): void };

function maskedEmail(email: string) {
  const [local = "", domain = ""] = email.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return domain ? `${visible}•••@${domain}` : email;
}

/**
 * Waiting state for Magic's new-device approval. The same auth attempt keeps
 * running; once the buyer approves from their inbox, checkout continues on
 * its own — this screen never fails the payment.
 */
export function DeviceApprovalState({ email, onStartOver }: Props) {
  const tokens = useTokens();
  return (
    <div aria-live="polite" style={{ ...center, gap: 8 }}>
      <svg
        aria-hidden="true"
        fill="none"
        height="34"
        stroke={tokens.ink}
        strokeWidth="1.6"
        viewBox="0 0 24 24"
        width="34"
      >
        <rect height="14" rx="2" width="18" x="3" y="5" />
        <path d="m3 7 9 6 9-6" />
      </svg>
      <div style={{ fontSize: 17, fontWeight: 620 }}>{BUYER_COPY.deviceApproval.title}</div>
      <div style={{ color: tokens.muted, fontSize: 13, lineHeight: 1.5 }}>
        {BUYER_COPY.deviceApproval.body} <strong>{maskedEmail(email)}</strong>.{" "}
        {BUYER_COPY.deviceApproval.hint}
      </div>
      <span
        aria-hidden="true"
        style={{
          background: tokens.accent,
          borderRadius: 2,
          display: "block",
          height: 3,
          marginTop: 10,
          width: 64,
        }}
      >
        <span
          style={{
            animation: "tab-device-wait 1.4s ease-in-out infinite",
            background: tokens.paper,
            borderRadius: 2,
            display: "block",
            height: 3,
            opacity: 0.7,
            width: 20,
          }}
        />
      </span>
      <style>{`
        @keyframes tab-device-wait {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(44px); }
        }
        @media (prefers-reduced-motion: reduce) {
          [aria-live="polite"] span span { animation: none !important; }
        }
      `}</style>
      <button onClick={onStartOver} style={{ ...quietButton(tokens), marginTop: 12 }} type="button">
        {BUYER_COPY.auth.startOver}
      </button>
    </div>
  );
}
