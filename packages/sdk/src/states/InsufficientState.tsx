import { useState } from "react";

import { BUYER_COPY, buyerFormat } from "../copy";
import { UsdcGlyph } from "../marks";
import { center, monoFamily, panel, primaryButton, quietButton, useTokens } from "../styles";
import { grantDeliveredUsdc, type TestFundsGrant } from "../test-rail-api";

type Props = {
  balance: string;
  mode: "live" | "test";
  onAddFunds(): void;
  onCancel(): void;
  /** Testnet only: claim starter Base Sepolia funds in-flow. */
  onGetTestFunds?: (() => Promise<TestFundsGrant>) | undefined;
  /** Called after a grant verifiably delivered USDC — recheck the balance. */
  onRecheck(): void;
  shortfall: string;
};

type ClaimPhase = { kind: "claiming" } | { kind: "failed"; message: string } | { kind: "idle" };

export function InsufficientState({
  balance,
  mode,
  onAddFunds,
  onCancel,
  onGetTestFunds,
  onRecheck,
  shortfall,
}: Props) {
  const tokens = useTokens();
  const [claim, setClaim] = useState<ClaimPhase>({ kind: "idle" });
  const testFlow = mode === "test" && onGetTestFunds;

  const claimTestFunds = async () => {
    if (!onGetTestFunds || claim.kind === "claiming") return;
    setClaim({ kind: "claiming" });
    try {
      const grant = await onGetTestFunds();
      if (grantDeliveredUsdc(grant)) {
        onRecheck();
        return;
      }
      const blocker = grant.legs.find((leg) => leg.asset === "usdc")?.blocker;
      setClaim({ kind: "failed", message: blocker ?? BUYER_COPY.testFunds.failed });
    } catch (error) {
      setClaim({
        kind: "failed",
        message: error instanceof Error ? error.message : BUYER_COPY.testFunds.failed,
      });
    }
  };

  return (
    <div style={center}>
      <div style={{ fontSize: 17, fontWeight: 620 }}>{BUYER_COPY.insufficient.title}</div>
      <div style={{ ...panel(tokens), marginTop: 18 }}>
        <span style={{ alignItems: "center", display: "flex", gap: 7 }}>
          <UsdcGlyph size={17} />
          <span style={{ color: tokens.muted, fontSize: 13 }}>{BUYER_COPY.balance.label}</span>
        </span>
        <strong style={{ fontFamily: monoFamily, fontSize: 13 }}>
          {buyerFormat.available(`$${balance}`)}
        </strong>
      </div>
      <div
        style={{
          background: tokens.amberBackground,
          borderRadius: 10,
          color: tokens.amber,
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
      {testFlow ? (
        <>
          <button
            disabled={claim.kind === "claiming"}
            onClick={() => void claimTestFunds()}
            style={{ ...primaryButton(tokens), marginTop: 16 }}
            type="button"
          >
            {claim.kind === "claiming" ? BUYER_COPY.testFunds.claiming : BUYER_COPY.testFunds.cta}
          </button>
          {claim.kind === "claiming" ? (
            <div
              aria-live="polite"
              role="status"
              style={{ color: tokens.muted, fontSize: 12, marginTop: 8 }}
            >
              {BUYER_COPY.testFunds.label} · Base Sepolia
            </div>
          ) : null}
          {claim.kind === "failed" ? (
            <div role="alert" style={{ color: tokens.amber, fontSize: 12, marginTop: 8 }}>
              {claim.message}
            </div>
          ) : null}
          <button
            onClick={onAddFunds}
            style={{ ...quietButton(tokens), marginTop: 9 }}
            type="button"
          >
            {BUYER_COPY.buttons.addFunds}
          </button>
        </>
      ) : (
        <button
          onClick={onAddFunds}
          style={{ ...primaryButton(tokens), marginTop: 16 }}
          type="button"
        >
          {BUYER_COPY.buttons.addFunds}
        </button>
      )}
      <button onClick={onCancel} style={{ ...quietButton(tokens), marginTop: 9 }} type="button">
        {BUYER_COPY.buttons.cancel}
      </button>
    </div>
  );
}
