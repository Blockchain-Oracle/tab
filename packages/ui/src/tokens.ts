export const TAB_PALETTE = Object.freeze({
  cobalt: "#3157E8",
  danger: "#B83F4A",
  emerald: "#1F7A4D",
  ink: "#15130F",
  line: "#DDD6C8",
  muted: "#6C665C",
  paper: "#F4F0E7",
  surface: "#FFFCF7",
  testnetAmber: "#9A6400",
} as const);

export const TAB_FONT_ROLES = Object.freeze({
  evidence: '"Geist Mono", "SFMono-Regular", Consolas, monospace',
  marketingEmphasis: '"Instrument Serif", Georgia, serif',
  product: '"Instrument Sans", "Helvetica Neue", Arial, sans-serif',
} as const);

export const TAB_THEME_MODES = Object.freeze(["light", "dark", "system"] as const);
export type TabThemeMode = (typeof TAB_THEME_MODES)[number];

export const TAB_LIGHT_THEME = Object.freeze({
  action: TAB_PALETTE.cobalt,
  canvas: TAB_PALETTE.paper,
  line: TAB_PALETTE.line,
  modeLive: TAB_PALETTE.ink,
  modeTest: TAB_PALETTE.testnetAmber,
  statusDanger: TAB_PALETTE.danger,
  statusStale: TAB_PALETTE.muted,
  statusSuccess: TAB_PALETTE.emerald,
  statusUnavailable: TAB_PALETTE.muted,
  statusWarning: TAB_PALETTE.testnetAmber,
  surface: TAB_PALETTE.surface,
  text: TAB_PALETTE.ink,
  textMuted: TAB_PALETTE.muted,
} as const);

export const TAB_DARK_THEME = Object.freeze({
  action: TAB_PALETTE.cobalt,
  canvas: TAB_PALETTE.ink,
  line: TAB_PALETTE.muted,
  modeLive: TAB_PALETTE.surface,
  modeTest: TAB_PALETTE.testnetAmber,
  statusDanger: TAB_PALETTE.danger,
  statusStale: TAB_PALETTE.line,
  statusSuccess: TAB_PALETTE.emerald,
  statusUnavailable: TAB_PALETTE.line,
  statusWarning: TAB_PALETTE.testnetAmber,
  surface: TAB_PALETTE.ink,
  text: TAB_PALETTE.surface,
  textMuted: TAB_PALETTE.line,
} as const);

export const TAB_FOCUS_TOKENS = Object.freeze({
  color: TAB_PALETTE.cobalt,
  offset: "3px",
  width: "2px",
} as const);

export const TAB_MOTION_TOKENS = Object.freeze({
  durationBase: "220ms",
  durationFast: "120ms",
  durationSlow: "480ms",
  easing: "cubic-bezier(0.2, 0, 0, 1)",
  flowlineDrawDuration: "640ms",
  travelDistance: "24px",
} as const);

export const TAB_REDUCED_MOTION_TOKENS = Object.freeze({
  durationBase: "1ms",
  durationFast: "1ms",
  durationSlow: "1ms",
  flowlineDrawDuration: "1ms",
  travelDistance: "0px",
} as const);
