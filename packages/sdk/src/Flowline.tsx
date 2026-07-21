import type { ReactElement } from "react";

import type { CheckoutStage } from "./checkout-state";
import { useTokens } from "./styles";

type FlowStep = { id: string; label: string };

const STEPS: readonly FlowStep[] = [
  { id: "sign-in", label: "Sign in" },
  { id: "balance", label: "Balance" },
  { id: "pay", label: "Pay" },
  { id: "done", label: "Done" },
] as const;

/** Maps the real checkout stage onto the four buyer-visible steps. */
function activeIndex(stage: CheckoutStage): number {
  switch (stage) {
    case "email":
    case "email-sending":
    case "otp":
    case "otp-verifying":
    case "device-approval":
      return 0;
    case "balance-loading":
    case "balance-ready":
    case "insufficient":
    case "add-funds":
      return 1;
    case "confirming":
    case "stuck":
      return 2;
    case "success":
      return 3;
    default:
      return 0;
  }
}

/**
 * The checkout flowline: advances ONLY on real state-machine events. The
 * active segment breathes with a subtle CSS pulse while work is in flight —
 * no time-based progress that could outrun the payment.
 */
export function Flowline({ stage }: { stage: CheckoutStage }): ReactElement {
  const tokens = useTokens();
  const active = activeIndex(stage);
  const working =
    stage === "email-sending" ||
    stage === "otp-verifying" ||
    stage === "balance-loading" ||
    stage === "confirming";

  return (
    <ol
      aria-label="Checkout progress"
      style={{
        display: "flex",
        gap: 6,
        listStyle: "none",
        margin: 0,
        padding: "10px 14px 0",
      }}
    >
      {STEPS.map((step, index) => {
        const state = index < active ? "done" : index === active ? "active" : "upcoming";
        const isDone = stage === "success" && index === STEPS.length - 1;
        const color =
          isDone || state === "done"
            ? tokens.ink
            : state === "active"
              ? tokens.accent
              : tokens.border;
        return (
          <li
            aria-current={state === "active" ? "step" : undefined}
            key={step.id}
            style={{ flex: 1, minWidth: 0 }}
          >
            <span
              style={{
                background: color,
                borderRadius: 2,
                display: "block",
                height: 3,
                ...(working && state === "active"
                  ? { animation: "tab-flowline-pulse 1.1s ease-in-out infinite" }
                  : undefined),
              }}
            />
            <span
              style={{
                color: state === "upcoming" ? tokens.muted : tokens.ink,
                display: "block",
                fontSize: 10.5,
                fontWeight: state === "active" ? 620 : 500,
                letterSpacing: "0.04em",
                marginTop: 5,
                overflow: "hidden",
                textOverflow: "ellipsis",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              {step.label}
            </span>
          </li>
        );
      })}
      <style>{`
        @keyframes tab-flowline-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
        @media (prefers-reduced-motion: reduce) {
          [aria-label="Checkout progress"] span { animation: none !important; }
        }
      `}</style>
    </ol>
  );
}
