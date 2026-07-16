import { type KeyboardEvent, type ReactNode, type RefObject, useEffect, useRef } from "react";

import type { CheckoutContext } from "./checkout-api";
import type { CheckoutStage } from "./checkout-state";
import { BUYER_COPY } from "./copy";
import { colors, font, overlay, sheet } from "./styles";

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
  const dialogRef = useRef<HTMLDivElement>(null);
  const name = context.merchant.businessName?.trim() || BUYER_COPY.merchant;
  const initial = name.slice(0, 1).toUpperCase();
  const canClose = stage !== "confirming";
  useEffect(() => {
    dialogRef.current?.focus();
    return () => returnFocusRef.current?.focus();
  }, [returnFocusRef]);

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
  return (
    <div style={overlay}>
      <div
        aria-label={BUYER_COPY.checkout}
        aria-modal="true"
        onKeyDown={keyDown}
        ref={dialogRef}
        role="dialog"
        style={sheet}
        tabIndex={-1}
      >
        <div
          style={{
            alignItems: "center",
            borderBottom: "1px solid #F0EEE8",
            display: "flex",
            gap: 10,
            padding: "12px 14px",
          }}
        >
          {context.merchant.logoUrl ? (
            <img
              alt=""
              height={28}
              src={context.merchant.logoUrl}
              style={{ borderRadius: 8, objectFit: "cover", width: 28 }}
              width={28}
            />
          ) : (
            <div
              aria-hidden="true"
              style={{
                alignItems: "center",
                background: "#F1EFE9",
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                display: "flex",
                fontSize: 13,
                fontWeight: 600,
                height: 28,
                justifyContent: "center",
                width: 28,
              }}
            >
              {initial}
            </div>
          )}
          <div style={{ flex: 1, fontSize: 13, fontWeight: 600, minWidth: 0 }}>{name}</div>
          <div style={{ color: colors.muted, fontSize: 13, fontWeight: 600 }}>${amount}</div>
          {canClose ? (
            <button
              aria-label={BUYER_COPY.buttons.close}
              onClick={onCancel}
              style={{
                ...font,
                background: "transparent",
                border: 0,
                cursor: "pointer",
                fontSize: 20,
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
              background: "#FBF1DC",
              color: colors.warning,
              fontSize: 11,
              padding: "7px 14px",
            }}
          >
            {BUYER_COPY.testMode}
          </div>
        ) : null}
        <div style={{ padding: "26px 22px 24px" }}>{children}</div>
        <div
          style={{
            background: "#FCFBF9",
            borderTop: "1px solid #F0EEE8",
            color: "#8C8A80",
            fontSize: 11,
            padding: 11,
            textAlign: "center",
          }}
        >
          {BUYER_COPY.footer}
        </div>
      </div>
    </div>
  );
}
