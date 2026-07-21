import { type CSSProperties, createContext, useContext } from "react";

/**
 * Ink & Evidence tokens for the embedded checkout. The SDK ships zero
 * dependencies, so these mirror @tab/ui's palette by value. Merchants may
 * override the exposed subset through the PayButton `appearance` prop.
 */
export const defaultTokens = {
  accent: "#E8501F",
  amber: "#8F6205",
  amberBackground: "#FBF3DF",
  border: "#E7E3DA",
  canvas: "#FFFFFF",
  ink: "#161310",
  inkSoft: "#2B2721",
  muted: "#6E6961",
  pale: "#F8F6F1",
  paper: "#FAF8F3",
  verified: "#0E7A45",
} as const;

export type CheckoutTokens = { [K in keyof typeof defaultTokens]: string };

/** Merchant-overridable subset: brand action color + accent. */
export type CheckoutAppearance = {
  /** Primary action (pay button) color. Defaults to Tab ink. */
  actionColor?: string;
  /** Progress/emphasis accent. Defaults to Tab vermilion. */
  accentColor?: string;
};

export function createTokens(appearance: CheckoutAppearance | undefined): CheckoutTokens {
  return {
    ...defaultTokens,
    ...(appearance?.accentColor ? { accent: appearance.accentColor } : undefined),
    ...(appearance?.actionColor ? { ink: appearance.actionColor } : undefined),
  };
}

export const TokensContext = createContext<CheckoutTokens>(defaultTokens);

export function useTokens(): CheckoutTokens {
  return useContext(TokensContext);
}

export const monoFamily = '"Geist Mono", ui-monospace, "SFMono-Regular", Consolas, monospace';

export function font(tokens: CheckoutTokens): CSSProperties {
  return {
    WebkitFontSmoothing: "antialiased",
    color: tokens.ink,
    fontFamily:
      "General Sans, Instrument Sans, Geist, ui-sans-serif, system-ui, -apple-system, sans-serif",
  };
}

export function primaryButton(tokens: CheckoutTokens): CSSProperties {
  return {
    ...font(tokens),
    alignItems: "center",
    background: tokens.ink,
    border: 0,
    borderRadius: 999,
    color: tokens.paper,
    cursor: "pointer",
    display: "flex",
    fontSize: 15,
    fontWeight: 560,
    height: 48,
    justifyContent: "center",
    width: "100%",
  };
}

export function quietButton(tokens: CheckoutTokens): CSSProperties {
  return {
    ...primaryButton(tokens),
    background: tokens.canvas,
    border: `1px solid ${tokens.border}`,
    color: tokens.ink,
    height: 44,
  };
}

export const overlay: CSSProperties = {
  alignItems: "flex-end",
  background: "rgba(22, 19, 16, 0.5)",
  display: "flex",
  inset: 0,
  justifyContent: "center",
  padding: 12,
  position: "fixed",
  zIndex: 2147483000,
};

export function sheet(tokens: CheckoutTokens): CSSProperties {
  return {
    ...font(tokens),
    background: tokens.canvas,
    borderRadius: 18,
    boxShadow: "0 24px 64px rgba(22, 19, 16, 0.28)",
    maxHeight: "calc(100vh - 24px)",
    maxWidth: 380,
    overflow: "auto",
    width: "100%",
  };
}

export const center: CSSProperties = {
  alignItems: "center",
  display: "flex",
  flexDirection: "column",
  textAlign: "center",
};

export function field(tokens: CheckoutTokens): CSSProperties {
  return {
    ...font(tokens),
    border: `1.5px solid ${tokens.ink}`,
    borderRadius: 10,
    boxShadow: "0 0 0 3px rgba(22, 19, 16, 0.08)",
    boxSizing: "border-box",
    fontSize: 14,
    height: 46,
    outline: 0,
    padding: "0 14px",
    width: "100%",
  };
}

export function panel(tokens: CheckoutTokens): CSSProperties {
  return {
    alignItems: "center",
    background: tokens.pale,
    border: `1px solid ${tokens.border}`,
    borderRadius: 12,
    boxSizing: "border-box",
    display: "flex",
    justifyContent: "space-between",
    padding: "13px 14px",
    width: "100%",
  };
}
