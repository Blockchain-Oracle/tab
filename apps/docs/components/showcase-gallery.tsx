"use client";

import {
  AddFundsState,
  BalanceState,
  createTokens,
  DeviceApprovalState,
  ErrorState,
  Flowline,
  IdleState,
  InsufficientState,
  LoadingState,
  StuckState,
  SuccessState,
  TokensContext,
} from "@runtab/sdk/showcase";
import { createRef, type ReactNode, useState } from "react";

const noop = () => {};

type Card = { code: string; node: ReactNode; note: string; title: string };

const CARDS: Card[] = [
  {
    title: "PayButton trigger",
    note: "The idle trigger — the only thing a merchant renders.",
    code: `<PayButton
  apiBaseUrl="https://app.your-tab.example"
  publishableKey="pk_test_…"
  intentUrl="/api/payment-intent"
  onSuccess={(txId, changes) => confirm(txId)}
/>`,
    node: <IdleState amount="12.00" buttonRef={createRef()} disabled={false} onClick={noop} />,
  },
  {
    title: "Flowline",
    note: "Progress strip — advances only on real checkout events.",
    code: `<Flowline stage="confirming" />`,
    node: <Flowline stage="confirming" />,
  },
  {
    title: "Balance",
    note: "Real balance read; test mode reads Base Sepolia USDC on-chain.",
    code: `<BalanceState
  amount="12.00" balance="20.00"
  merchantName="Museum Shop"
  mode="test" onConfirm={confirm}
/>`,
    node: (
      <BalanceState
        amount="12.00"
        balance="20.00"
        merchantName="Museum Shop"
        mode="test"
        onConfirm={noop}
      />
    ),
  },
  {
    title: "Insufficient — test mode",
    note: "The exact shortfall, plus an in-flow test-funds grant.",
    code: `<InsufficientState
  balance="0.00" shortfall="12.00" mode="test"
  onGetTestFunds={claim} onRecheck={recheck}
  onAddFunds={open} onCancel={close}
/>`,
    node: (
      <InsufficientState
        balance="0.00"
        mode="test"
        onAddFunds={noop}
        onCancel={noop}
        onGetTestFunds={() => new Promise(() => {})}
        onRecheck={noop}
        shortfall="12.00"
      />
    ),
  },
  {
    title: "Add funds",
    note: "The buyer's real deposit address — selectable, copyable.",
    code: `<AddFundsState
  address="0x1111…1111" mode="test"
  onRecheck={recheck} onCancel={close}
/>`,
    node: (
      <AddFundsState
        address="0x1111111111111111111111111111111111111111"
        mode="test"
        onCancel={noop}
        onRecheck={noop}
      />
    ),
  },
  {
    title: "Device approval",
    note: "A real state, not a failure — continues automatically.",
    code: `<DeviceApprovalState
  email="you@example.com"
  onStartOver={restart}
/>`,
    node: <DeviceApprovalState email="you@example.com" onStartOver={noop} />,
  },
  {
    title: "Processing",
    note: "Honest loading — no fake progress bars.",
    code: `<LoadingState label="Processing your payment…" />`,
    node: <LoadingState label="Processing your payment…" />,
  },
  {
    title: "Still working",
    note: "After 20s confirming: money may be in flight — never claims failure.",
    code: `<StuckState onClose={close} />`,
    node: <StuckState onClose={noop} />,
  },
  {
    title: "Success",
    note: "Receipt with reference code and the stamped 402 → 200.",
    code: `<SuccessState
  amount="12.00" mode="test"
  refCode="TAB-7K2M9" onDone={close}
/>`,
    node: <SuccessState amount="12.00" mode="test" onDone={noop} refCode="TAB-7K2M9" />,
  },
  {
    title: "Honest error",
    note: '"Nothing has been charged" — only promised when provably true.',
    code: `<ErrorState
  title="Not enough to complete this payment"
  body="Nothing has been charged."
  onCancel={close} onRetry={retry}
/>`,
    node: (
      <ErrorState
        body="Nothing has been charged."
        onCancel={noop}
        onRetry={noop}
        title="Something didn’t go through"
      />
    ),
  },
];

function CopyButton({ code }: { code: string }) {
  const [state, setState] = useState<"copied" | "failed" | "idle">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 1800);
  };
  return (
    <button
      onClick={() => void copy()}
      style={{
        background: state === "copied" ? "#f2efe9" : "transparent",
        border: "1px solid #4a443c",
        borderRadius: 999,
        color: state === "copied" ? "#161310" : "#a9a399",
        cursor: "pointer",
        fontSize: 11,
        padding: "3px 10px",
      }}
      type="button"
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Select + copy" : "Copy"}
    </button>
  );
}

function ShowcaseCard({ card }: { card: Card }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div style={{ perspective: 1200 }}>
      <div
        style={{
          display: "grid",
          transform: flipped ? "rotateY(180deg)" : undefined,
          transformStyle: "preserve-3d",
          transition: "transform 480ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div
          style={{
            backfaceVisibility: "hidden",
            background: "var(--color-fd-card)",
            border: "1px solid var(--color-fd-border)",
            borderRadius: 16,
            display: "grid",
            gap: 12,
            gridArea: "1 / 1",
            gridTemplateRows: "auto 1fr auto",
            minHeight: 340,
            padding: 20,
          }}
        >
          <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
            <strong style={{ fontSize: 14 }}>{card.title}</strong>
            <button
              onClick={() => setFlipped(true)}
              style={{
                background: "transparent",
                border: "1px solid var(--color-fd-border)",
                borderRadius: 999,
                color: "var(--color-fd-muted-foreground)",
                cursor: "pointer",
                fontSize: 11,
                padding: "3px 10px",
              }}
              type="button"
            >
              {"</> Code"}
            </button>
          </div>
          <div aria-hidden style={{ alignSelf: "center", pointerEvents: "none" }}>
            {card.node}
          </div>
          <span style={{ color: "var(--color-fd-muted-foreground)", fontSize: 12 }}>
            {card.note}
          </span>
        </div>
        <div
          style={{
            backfaceVisibility: "hidden",
            background: "#161310",
            border: "1px solid var(--color-fd-border)",
            borderRadius: 16,
            display: "grid",
            gap: 12,
            gridArea: "1 / 1",
            gridTemplateRows: "auto 1fr",
            minHeight: 340,
            padding: 20,
            transform: "rotateY(180deg)",
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: 8,
              justifyContent: "space-between",
            }}
          >
            <strong style={{ color: "#f2efe9", fontSize: 14 }}>{card.title}</strong>
            <span style={{ display: "flex", gap: 8 }}>
              <CopyButton code={card.code} />
              <button
                onClick={() => setFlipped(false)}
                style={{
                  background: "transparent",
                  border: "1px solid #4a443c",
                  borderRadius: 999,
                  color: "#a9a399",
                  cursor: "pointer",
                  fontSize: 11,
                  padding: "3px 10px",
                }}
                type="button"
              >
                Preview
              </button>
            </span>
          </div>
          <pre
            style={{
              color: "#f2efe9",
              fontFamily: "Geist Mono, SFMono-Regular, Consolas, monospace",
              fontSize: 12.5,
              lineHeight: 1.65,
              margin: 0,
              overflowX: "auto",
              whiteSpace: "pre",
            }}
          >
            {card.code}
          </pre>
        </div>
      </div>
    </div>
  );
}

export function ShowcaseGallery() {
  const tokens = createTokens(undefined);
  return (
    <TokensContext.Provider value={tokens}>
      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          margin: "24px 0",
        }}
      >
        {CARDS.map((card) => (
          <ShowcaseCard card={card} key={card.title} />
        ))}
      </div>
    </TokensContext.Provider>
  );
}
