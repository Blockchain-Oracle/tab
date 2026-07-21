import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const RED_MARKER = "[RED: shared visual tokens]";
const THEME_PROVIDER_URL = new URL("./theme-provider.ts", import.meta.url);
const TOKEN_IMPLEMENTATION_URL = new URL("./tokens.ts", import.meta.url);
const THEME_STYLES_URL = new URL("./theme.css", import.meta.url);

const expectedPalette = {
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
};

const expectedFontRoles = {
  evidence: '"Geist Mono", "SFMono-Regular", Consolas, monospace',
  marketingEmphasis: '"Instrument Serif", Georgia, serif',
  product: '"Instrument Sans", "Helvetica Neue", Arial, sans-serif',
};

const expectedLightTheme = {
  accent: "#E8501F",
  action: "#161310",
  actionHover: "#2B2721",
  actionText: "#FAF8F3",
  canvas: "#FAF8F3",
  focusColor: "#161310",
  line: "#E7E3DA",
  modeLive: "#161310",
  modeTest: "#8F6205",
  statusDanger: "#B3382F",
  statusStale: "#6E6961",
  statusSuccess: "#0E7A45",
  statusUnavailable: "#6E6961",
  statusWarning: "#8F6205",
  surface: "#FFFFFF",
  text: "#161310",
  textMuted: "#6E6961",
};

const expectedDarkTheme = {
  accent: "#FF6B35",
  action: "#F2EFE9",
  actionHover: "#DFDACF",
  actionText: "#141210",
  canvas: "#141210",
  focusColor: "#F2EFE9",
  line: "#302C26",
  modeLive: "#F2EFE9",
  modeTest: "#E3AA43",
  statusDanger: "#E56A5E",
  statusStale: "#A9A399",
  statusSuccess: "#3FC98A",
  statusUnavailable: "#A9A399",
  statusWarning: "#E3AA43",
  surface: "#1C1915",
  text: "#F2EFE9",
  textMuted: "#A9A399",
};

const expectedLightVariables = {
  "--tab-accent": "var(--tab-color-vermilion)",
  "--tab-action": "var(--tab-color-ink)",
  "--tab-action-hover": "var(--tab-color-ink-soft)",
  "--tab-action-text": "var(--tab-color-paper)",
  "--tab-canvas": "var(--tab-color-paper)",
  "--tab-focus-color": "var(--tab-color-ink)",
  "--tab-line": "var(--tab-color-line)",
  "--tab-mode-live": "var(--tab-color-ink)",
  "--tab-mode-test": "var(--tab-color-testnet-amber)",
  "--tab-status-danger": "var(--tab-color-danger)",
  "--tab-status-stale": "var(--tab-color-muted)",
  "--tab-status-success": "var(--tab-color-verified)",
  "--tab-status-unavailable": "var(--tab-color-muted)",
  "--tab-status-warning": "var(--tab-color-testnet-amber)",
  "--tab-surface": "var(--tab-color-surface)",
  "--tab-text": "var(--tab-color-ink)",
  "--tab-text-muted": "var(--tab-color-muted)",
  "color-scheme": "light",
};

const expectedDarkVariables = {
  "--tab-accent": "var(--tab-color-vermilion-bright)",
  "--tab-action": "var(--tab-color-bone)",
  "--tab-action-hover": "var(--tab-color-bone-soft)",
  "--tab-action-text": "var(--tab-color-night)",
  "--tab-canvas": "var(--tab-color-night)",
  "--tab-focus-color": "var(--tab-color-bone)",
  "--tab-line": "var(--tab-color-night-line)",
  "--tab-mode-live": "var(--tab-color-bone)",
  "--tab-mode-test": "var(--tab-color-testnet-amber-bright)",
  "--tab-status-danger": "var(--tab-color-danger-bright)",
  "--tab-status-stale": "var(--tab-color-bone-muted)",
  "--tab-status-success": "var(--tab-color-verified-bright)",
  "--tab-status-unavailable": "var(--tab-color-bone-muted)",
  "--tab-status-warning": "var(--tab-color-testnet-amber-bright)",
  "--tab-surface": "var(--tab-color-night-raised)",
  "--tab-text": "var(--tab-color-bone)",
  "--tab-text-muted": "var(--tab-color-bone-muted)",
  "color-scheme": "dark",
};

function blockFor(source, header) {
  const headerIndex = source.indexOf(header);
  assert.notEqual(headerIndex, -1, `Missing CSS block: ${header}`);
  const openIndex = source.indexOf("{", headerIndex + header.length);
  assert.notEqual(openIndex, -1, `Missing opening brace: ${header}`);

  let depth = 1;
  for (let index = openIndex + 1; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(openIndex + 1, index);
  }

  assert.fail(`Missing closing brace: ${header}`);
}

function declarationsFor(source, selector) {
  const declarations = {};
  for (const segment of blockFor(source, selector).split(";")) {
    const separator = segment.indexOf(":");
    if (separator === -1) continue;
    const property = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();
    if (property) {
      declarations[property] = /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : value;
    }
  }
  return declarations;
}

function assertDeclarations(source, selector, expected) {
  const declarations = declarationsFor(source, selector);
  const observed = Object.fromEntries(
    Object.keys(expected).map((property) => [property, declarations[property]]),
  );
  assert.deepEqual(observed, expected);
  return declarations;
}

async function loadImplementation() {
  try {
    return await import(TOKEN_IMPLEMENTATION_URL.href);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      error.code === "ERR_MODULE_NOT_FOUND" &&
      error.url === TOKEN_IMPLEMENTATION_URL.href
    ) {
      process.stderr.write(`${RED_MARKER}\n`);
      throw new Error("Shared visual-token implementation exports are absent.", { cause: error });
    }
    throw error;
  }
}

test("ink-and-evidence tokens are exact, themed, accessible, and motion-aware", async () => {
  const implementation = await loadImplementation();
  const themeProvider = await import(THEME_PROVIDER_URL.href);
  const css = await readFile(THEME_STYLES_URL, "utf8");

  assert.deepEqual(implementation.TAB_PALETTE, expectedPalette);
  assert.deepEqual(implementation.TAB_FONT_ROLES, expectedFontRoles);
  assert.deepEqual(implementation.TAB_THEME_MODES, ["light", "dark", "system"]);
  assert.deepEqual(implementation.TAB_LIGHT_THEME, expectedLightTheme);
  assert.deepEqual(implementation.TAB_DARK_THEME, expectedDarkTheme);
  assert.deepEqual(implementation.TAB_FOCUS_TOKENS, {
    offset: "3px",
    width: "2px",
  });
  assert.deepEqual(implementation.TAB_RADIUS_TOKENS, {
    l: "16px",
    m: "12px",
    pill: "999px",
    s: "8px",
  });
  assert.deepEqual(Object.keys(implementation.TAB_SHADOW_TOKENS).sort(), ["raise", "sheet"]);
  assert.deepEqual(Object.keys(implementation.TAB_MOTION_TOKENS).sort(), [
    "durationBase",
    "durationFast",
    "durationSlow",
    "easing",
    "easingSettle",
    "flowlineDrawDuration",
    "stampDuration",
    "travelDistance",
  ]);
  assert.match(implementation.TAB_MOTION_TOKENS.durationFast, /^\d+ms$/);
  assert.match(implementation.TAB_MOTION_TOKENS.durationBase, /^\d+ms$/);
  assert.match(implementation.TAB_MOTION_TOKENS.durationSlow, /^\d+ms$/);
  assert.match(implementation.TAB_MOTION_TOKENS.easing, /^(cubic-bezier|linear)\(/);
  assert.match(implementation.TAB_MOTION_TOKENS.easingSettle, /^(cubic-bezier|linear)\(/);
  assert.match(implementation.TAB_MOTION_TOKENS.flowlineDrawDuration, /^\d+ms$/);
  assert.match(implementation.TAB_MOTION_TOKENS.stampDuration, /^\d+ms$/);
  assert.match(implementation.TAB_MOTION_TOKENS.travelDistance, /^\d+px$/);
  assert.deepEqual(implementation.TAB_REDUCED_MOTION_TOKENS, {
    durationBase: "1ms",
    durationFast: "1ms",
    durationSlow: "1ms",
    flowlineDrawDuration: "1ms",
    stampDuration: "1ms",
    travelDistance: "0px",
  });

  for (const value of [
    implementation.TAB_PALETTE,
    implementation.TAB_FONT_ROLES,
    implementation.TAB_THEME_MODES,
    implementation.TAB_LIGHT_THEME,
    implementation.TAB_DARK_THEME,
    implementation.TAB_FOCUS_TOKENS,
    implementation.TAB_RADIUS_TOKENS,
    implementation.TAB_SHADOW_TOKENS,
    implementation.TAB_MOTION_TOKENS,
    implementation.TAB_REDUCED_MOTION_TOKENS,
  ]) {
    assert.equal(Object.isFrozen(value), true);
  }

  const baseDeclarations = assertDeclarations(css, "[data-tab-ui]", {
    "--tab-color-bone": "#F2EFE9",
    "--tab-color-bone-muted": "#A9A399",
    "--tab-color-bone-soft": "#DFDACF",
    "--tab-color-danger": "#B3382F",
    "--tab-color-danger-bright": "#E56A5E",
    "--tab-color-vermilion": "#E8501F",
    "--tab-color-vermilion-bright": "#FF6B35",
    "--tab-color-ink": "#161310",
    "--tab-color-ink-soft": "#2B2721",
    "--tab-color-line": "#E7E3DA",
    "--tab-color-muted": "#6E6961",
    "--tab-color-night": "#141210",
    "--tab-color-night-line": "#302C26",
    "--tab-color-night-raised": "#1C1915",
    "--tab-color-paper": "#FAF8F3",
    "--tab-color-surface": "#FFFFFF",
    "--tab-color-testnet-amber": "#8F6205",
    "--tab-color-testnet-amber-bright": "#E3AA43",
    "--tab-color-verified": "#0E7A45",
    "--tab-color-verified-bright": "#3FC98A",
    "--tab-focus-offset": "3px",
    "--tab-focus-width": "2px",
    "--tab-font-evidence": '"Geist Mono", "SFMono-Regular", Consolas, monospace',
    "--tab-font-marketing-emphasis": '"Instrument Serif", Georgia, serif',
    "--tab-font-product": '"Instrument Sans", "Helvetica Neue", Arial, sans-serif',
    "--tab-radius-l": "16px",
    "--tab-radius-m": "12px",
    "--tab-radius-pill": "999px",
    "--tab-radius-s": "8px",
  });
  assert.match(baseDeclarations["--tab-motion-duration-fast"], /^\d+ms$/);
  assert.match(baseDeclarations["--tab-motion-duration-base"], /^\d+ms$/);
  assert.match(baseDeclarations["--tab-motion-duration-slow"], /^\d+ms$/);
  assert.match(baseDeclarations["--tab-motion-easing"], /^(cubic-bezier|linear)\(/);
  assert.match(baseDeclarations["--tab-motion-easing-settle"], /^(cubic-bezier|linear)\(/);
  assert.match(baseDeclarations["--tab-flowline-draw-duration"], /^\d+ms$/);
  assert.match(baseDeclarations["--tab-stamp-duration"], /^\d+ms$/);
  assert.match(baseDeclarations["--tab-motion-travel-distance"], /^\d+px$/);
  assert.equal(typeof baseDeclarations["--tab-shadow-raise"], "string");
  assert.equal(typeof baseDeclarations["--tab-shadow-sheet"], "string");

  assertDeclarations(css, '[data-tab-ui][data-tab-theme="light"]', expectedLightVariables);
  assertDeclarations(css, '[data-tab-ui][data-tab-theme="dark"]', expectedDarkVariables);
  assertDeclarations(css, '[data-tab-ui][data-tab-theme="system"]', expectedLightVariables);

  const darkMedia = blockFor(css, "@media (prefers-color-scheme: dark)");
  assertDeclarations(darkMedia, '[data-tab-ui][data-tab-theme="system"]', expectedDarkVariables);

  assertDeclarations(
    css,
    "[data-tab-ui] :where(a, button, input, select, textarea, [tabindex]):focus-visible",
    {
      outline: "var(--tab-focus-width) solid var(--tab-focus-color)",
      "outline-offset": "var(--tab-focus-offset)",
    },
  );

  const reducedMedia = blockFor(css, "@media (prefers-reduced-motion: reduce)");
  assertDeclarations(reducedMedia, "[data-tab-ui]", {
    "--tab-flowline-draw-duration": "1ms",
    "--tab-motion-duration-base": "1ms",
    "--tab-motion-duration-fast": "1ms",
    "--tab-motion-duration-slow": "1ms",
    "--tab-motion-travel-distance": "0px",
    "--tab-stamp-duration": "1ms",
  });

  const defaultTheme = themeProvider.TabThemeProvider({ children: "Tab" });
  assert.equal(defaultTheme.type, "div");
  assert.equal(defaultTheme.props["data-tab-ui"], "");
  assert.equal(defaultTheme.props["data-tab-theme"], "system");
  assert.equal(defaultTheme.props.children, "Tab");

  const darkTheme = themeProvider.TabThemeProvider({
    children: null,
    id: "ui-root",
    theme: "dark",
  });
  assert.equal(darkTheme.props.id, "ui-root");
  assert.equal(darkTheme.props["data-tab-theme"], "dark");
  assert.throws(
    () => themeProvider.TabThemeProvider({ children: null, theme: "sepia" }),
    (error) =>
      error instanceof themeProvider.InvalidTabThemeError &&
      error.message === "The Tab theme must be light, dark, or system.",
  );
});
