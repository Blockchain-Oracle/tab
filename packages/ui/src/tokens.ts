/**
 * Ink & Evidence — Tab's design tokens.
 *
 * Monochrome ink-first UI: near-black ink on refined paper in light mode,
 * warm true-dark in dark mode. Money-green appears ONLY at verified money
 * truth; testnet amber marks test funds; danger red is reserved for the
 * emergency ladder. Chain brand colors live only inside official marks.
 */
export const TAB_PALETTE = Object.freeze({
  bone: "#F2EFE9",
  boneMuted: "#A9A399",
  boneSoft: "#DFDACF",
  danger: "#B3382F",
  dangerBright: "#E56A5E",
  ink: "#161310",
  inkSoft: "#2B2721",
  line: "#E7E3DA",
  muted: "#6E6961",
  night: "#141210",
  nightLine: "#302C26",
  nightRaised: "#1C1915",
  paper: "#FAF8F3",
  surface: "#FFFFFF",
  testnetAmber: "#8F6205",
  testnetAmberBright: "#E3AA43",
  verified: "#0E7A45",
  verifiedBright: "#3FC98A",
  vermilion: "#E8501F",
  vermilionBright: "#FF6B35",
} as const);

export const TAB_FONT_ROLES = Object.freeze({
  evidence: '"Geist Mono", "SFMono-Regular", Consolas, monospace',
  marketingEmphasis: '"Instrument Serif", Georgia, serif',
  product: '"Instrument Sans", "Helvetica Neue", Arial, sans-serif',
} as const);

export const TAB_THEME_MODES = Object.freeze(["light", "dark", "system"] as const);
export type TabThemeMode = (typeof TAB_THEME_MODES)[number];

export const TAB_LIGHT_THEME = Object.freeze({
  accent: TAB_PALETTE.vermilion,
  action: TAB_PALETTE.ink,
  actionHover: TAB_PALETTE.inkSoft,
  actionText: TAB_PALETTE.paper,
  canvas: TAB_PALETTE.paper,
  focusColor: TAB_PALETTE.ink,
  line: TAB_PALETTE.line,
  modeLive: TAB_PALETTE.ink,
  modeTest: TAB_PALETTE.testnetAmber,
  statusDanger: TAB_PALETTE.danger,
  statusStale: TAB_PALETTE.muted,
  statusSuccess: TAB_PALETTE.verified,
  statusUnavailable: TAB_PALETTE.muted,
  statusWarning: TAB_PALETTE.testnetAmber,
  surface: TAB_PALETTE.surface,
  text: TAB_PALETTE.ink,
  textMuted: TAB_PALETTE.muted,
} as const);

export const TAB_DARK_THEME = Object.freeze({
  accent: TAB_PALETTE.vermilionBright,
  action: TAB_PALETTE.bone,
  actionHover: TAB_PALETTE.boneSoft,
  actionText: TAB_PALETTE.night,
  canvas: TAB_PALETTE.night,
  focusColor: TAB_PALETTE.bone,
  line: TAB_PALETTE.nightLine,
  modeLive: TAB_PALETTE.bone,
  modeTest: TAB_PALETTE.testnetAmberBright,
  statusDanger: TAB_PALETTE.dangerBright,
  statusStale: TAB_PALETTE.boneMuted,
  statusSuccess: TAB_PALETTE.verifiedBright,
  statusUnavailable: TAB_PALETTE.boneMuted,
  statusWarning: TAB_PALETTE.testnetAmberBright,
  surface: TAB_PALETTE.nightRaised,
  text: TAB_PALETTE.bone,
  textMuted: TAB_PALETTE.boneMuted,
} as const);

export const TAB_RADIUS_TOKENS = Object.freeze({
  l: "16px",
  m: "12px",
  pill: "999px",
  s: "8px",
} as const);

export const TAB_SHADOW_TOKENS = Object.freeze({
  raise: "0 1px 2px rgba(22, 19, 16, 0.06), 0 4px 16px rgba(22, 19, 16, 0.06)",
  sheet: "0 24px 64px rgba(22, 19, 16, 0.22)",
} as const);

export const TAB_FOCUS_TOKENS = Object.freeze({
  offset: "3px",
  width: "2px",
} as const);

export const TAB_MOTION_TOKENS = Object.freeze({
  durationBase: "220ms",
  durationFast: "120ms",
  durationSlow: "480ms",
  easing: "cubic-bezier(0.2, 0, 0, 1)",
  easingSettle: "cubic-bezier(0.22, 1, 0.36, 1)",
  flowlineDrawDuration: "640ms",
  stampDuration: "360ms",
  travelDistance: "24px",
} as const);

export const TAB_REDUCED_MOTION_TOKENS = Object.freeze({
  durationBase: "1ms",
  durationFast: "1ms",
  durationSlow: "1ms",
  flowlineDrawDuration: "1ms",
  stampDuration: "1ms",
  travelDistance: "0px",
} as const);
