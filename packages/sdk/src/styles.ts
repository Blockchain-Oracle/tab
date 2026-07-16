import type { CSSProperties } from "react";

export const colors = {
  blue: "#3B5BD9",
  border: "#E8E6DF",
  canvas: "#FFFFFF",
  green: "#257A46",
  ink: "#1C1B18",
  muted: "#5F5D55",
  pale: "#F8F7F4",
  warning: "#7A5410",
  warningBackground: "#FBF1DC",
} as const;

export const font: CSSProperties = {
  WebkitFontSmoothing: "antialiased",
  color: colors.ink,
  fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, sans-serif",
};

export const primaryButton: CSSProperties = {
  ...font,
  alignItems: "center",
  background: colors.ink,
  border: 0,
  borderRadius: 10,
  color: colors.canvas,
  cursor: "pointer",
  display: "flex",
  fontSize: 15,
  fontWeight: 500,
  height: 48,
  justifyContent: "center",
  width: "100%",
};

export const quietButton: CSSProperties = {
  ...primaryButton,
  background: colors.canvas,
  border: `1px solid ${colors.border}`,
  color: colors.ink,
  height: 44,
};

export const overlay: CSSProperties = {
  alignItems: "flex-end",
  background: "rgba(28, 27, 24, 0.48)",
  display: "flex",
  inset: 0,
  justifyContent: "center",
  padding: 12,
  position: "fixed",
  zIndex: 2147483000,
};

export const sheet: CSSProperties = {
  ...font,
  background: colors.canvas,
  borderRadius: 18,
  boxShadow: "0 24px 64px rgba(28, 27, 24, 0.3)",
  maxHeight: "calc(100vh - 24px)",
  maxWidth: 375,
  overflow: "auto",
  width: "100%",
};

export const center: CSSProperties = {
  alignItems: "center",
  display: "flex",
  flexDirection: "column",
  textAlign: "center",
};

export const field: CSSProperties = {
  ...font,
  border: `1.5px solid ${colors.blue}`,
  borderRadius: 10,
  boxShadow: "0 0 0 3px rgba(59, 91, 217, 0.13)",
  boxSizing: "border-box",
  fontSize: 14,
  height: 46,
  outline: 0,
  padding: "0 14px",
  width: "100%",
};

export const panel: CSSProperties = {
  alignItems: "center",
  background: colors.pale,
  border: `1px solid #EFEDE7`,
  borderRadius: 12,
  boxSizing: "border-box",
  display: "flex",
  justifyContent: "space-between",
  padding: "13px 14px",
  width: "100%",
};
