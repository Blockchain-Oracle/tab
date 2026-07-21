import { type KeyboardEvent, type ReactNode, type RefObject, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import type { CheckoutContext } from "./checkout-api";
import type { CheckoutStage } from "./checkout-state";
import { BUYER_COPY } from "./copy";
import { Flowline } from "./Flowline";
import { TabGlyph } from "./marks";
import { font, monoFamily, overlay, sheet, useTokens } from "./styles";

type Props = {
  amount: string;
  children: ReactNode;
  context: CheckoutContext;
  onCancel(): void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  stage: CheckoutStage;
};

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function CheckoutShell({
  amount,
  children,
  context,
  onCancel,
  returnFocusRef,
  stage,
}: Props) {
  const tokens = useTokens();
  const dialogRef = useRef<HTMLDivElement>(null);
  const name = context.merchant.businessName?.trim() || BUYER_COPY.merchant;
  const canClose = stage !== "confirming";

  useEffect(() => {
    dialogRef.current?.focus();
    return () => returnFocusRef.current?.focus();
  }, [returnFocusRef]);

  // The sheet renders in a portal, so every other body child is the merchant
  // page: make it inert for assistive tech and lock scroll while open.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const siblings = [...document.body.children].filter(
      (node) => !node.contains(dialogRef.current) && node.tagName !== "SCRIPT",
    );
    for (const node of siblings) {
      node.setAttribute("aria-hidden", "true");
      node.setAttribute("inert", "");
    }
    return () => {
      document.body.style.overflow = previousOverflow;
      for (const node of siblings) {
        node.removeAttribute("aria-hidden");
        node.removeAttribute("inert");
      }
    };
  }, []);

  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && canClose) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = focusable.at(0);
    const last = focusable.at(-1);
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === dialogRef.current)
    ) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return createPortal(
    <div data-tab-checkout-overlay="" style={overlay}>
      <style>{`
        [data-tab-checkout-overlay] :where(a, button, input, [tabindex]):focus-visible {
          outline: 2px solid ${tokens.ink};
          outline-offset: 3px;
        }
      `}</style>
      <div
        aria-label={BUYER_COPY.checkout}
        aria-modal="true"
        onKeyDown={keyDown}
        ref={dialogRef}
        role="dialog"
        style={sheet(tokens)}
        tabIndex={-1}
      >
        <div
          style={{
            alignItems: "center",
            borderBottom: `1px solid ${tokens.border}`,
            display: "flex",
            gap: 10,
            padding: "13px 14px",
          }}
        >
          <span aria-hidden="true" style={{ alignItems: "center", display: "flex", gap: 6 }}>
            <TabGlyph size={15} />
            <span style={{ fontSize: 15, fontWeight: 640, letterSpacing: "-0.02em" }}>tab</span>
          </span>
          <span
            style={{
              borderLeft: `1px solid ${tokens.border}`,
              color: tokens.muted,
              flex: 1,
              fontSize: 13,
              fontWeight: 560,
              minWidth: 0,
              overflow: "hidden",
              paddingLeft: 10,
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {context.merchant.logoUrl ? (
              <img
                alt=""
                height={18}
                src={context.merchant.logoUrl}
                style={{
                  borderRadius: 5,
                  marginRight: 6,
                  objectFit: "cover",
                  verticalAlign: "-4px",
                  width: 18,
                }}
                width={18}
              />
            ) : null}
            {name}
          </span>
          <span style={{ fontFamily: monoFamily, fontSize: 13, fontWeight: 620 }}>${amount}</span>
          {canClose ? (
            <button
              aria-label={BUYER_COPY.buttons.close}
              onClick={onCancel}
              style={{
                ...font(tokens),
                background: "transparent",
                border: 0,
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 20,
                lineHeight: 1,
                padding: "2px 6px",
              }}
              type="button"
            >
              ×
            </button>
          ) : null}
        </div>
        {context.mode === "test" ? (
          <div
            style={{
              background: tokens.amberBackground,
              color: tokens.amber,
              fontSize: 11,
              fontWeight: 560,
              padding: "7px 14px",
            }}
          >
            {BUYER_COPY.testMode}
          </div>
        ) : null}
        <Flowline stage={stage} />
        <div style={{ padding: "22px 22px 24px" }}>{children}</div>
        <div
          style={{
            background: tokens.paper,
            borderTop: `1px solid ${tokens.border}`,
            color: tokens.muted,
            fontSize: 11,
            padding: 11,
            textAlign: "center",
          }}
        >
          {BUYER_COPY.footer}
        </div>
      </div>
    </div>,
    document.body,
  );
}
