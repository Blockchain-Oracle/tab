import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const RED_MARKER = "[RED: shared visual tokens]";
const PUBLIC_API_URL = new URL("./index.ts", import.meta.url);
const TOKEN_IMPLEMENTATION_URL = new URL("./tokens.ts", import.meta.url);
const THEME_STYLES_URL = new URL("./theme.css", import.meta.url);

const expectedPalette = {
  cobalt: "#3157E8",
  danger: "#B83F4A",
  emerald: "#1F7A4D",
  ink: "#15130F",
  line: "#DDD6C8",
  muted: "#6C665C",
  paper: "#F4F0E7",
  surface: "#FFFCF7",
  testnetAmber: "#9A6400",
};

const expectedFontRoles = {
  evidence: '"Geist Mono", "SFMono-Regular", Consolas, monospace',
  marketingEmphasis: '"Instrument Serif", Georgia, serif',
  product: '"Instrument Sans", "Helvetica Neue", Arial, sans-serif',
};

const expectedLightTheme = {
  action: "#3157E8",
  canvas: "#F4F0E7",
  line: "#DDD6C8",
  modeLive: "#15130F",
  modeTest: "#9A6400",
  statusDanger: "#B83F4A",
  statusStale: "#6C665C",
  statusSuccess: "#1F7A4D",
  statusUnavailable: "#6C665C",
  statusWarning: "#9A6400",
  surface: "#FFFCF7",
  text: "#15130F",
  textMuted: "#6C665C",
};

const expectedDarkTheme = {
  action: "#3157E8",
  canvas: "#15130F",
  line: "#6C665C",
  modeLive: "#FFFCF7",
  modeTest: "#9A6400",
  statusDanger: "#B83F4A",
  statusStale: "#DDD6C8",
  statusSuccess: "#1F7A4D",
  statusUnavailable: "#DDD6C8",
  statusWarning: "#9A6400",
  surface: "#15130F",
  text: "#FFFCF7",
  textMuted: "#DDD6C8",
};

const expectedLightVariables = {
  "--tab-action": "var(--tab-color-cobalt)",
  "--tab-canvas": "var(--tab-color-paper)",
  "--tab-line": "var(--tab-color-line)",
  "--tab-mode-live": "var(--tab-color-ink)",
  "--tab-mode-test": "var(--tab-color-testnet-amber)",
  "--tab-status-danger": "var(--tab-color-danger)",
  "--tab-status-stale": "var(--tab-color-muted)",
  "--tab-status-success": "var(--tab-color-emerald)",
  "--tab-status-unavailable": "var(--tab-color-muted)",
  "--tab-status-warning": "var(--tab-color-testnet-amber)",
  "--tab-surface": "var(--tab-color-surface)",
  "--tab-text": "var(--tab-color-ink)",
  "--tab-text-muted": "var(--tab-color-muted)",
  "color-scheme": "light",
};

const expectedDarkVariables = {
  "--tab-action": "var(--tab-color-cobalt)",
  "--tab-canvas": "var(--tab-color-ink)",
  "--tab-line": "var(--tab-color-muted)",
  "--tab-mode-live": "var(--tab-color-surface)",
  "--tab-mode-test": "var(--tab-color-testnet-amber)",
  "--tab-status-danger": "var(--tab-color-danger)",
  "--tab-status-stale": "var(--tab-color-line)",
  "--tab-status-success": "var(--tab-color-emerald)",
  "--tab-status-unavailable": "var(--tab-color-line)",
  "--tab-status-warning": "var(--tab-color-testnet-amber)",
  "--tab-surface": "var(--tab-color-ink)",
  "--tab-text": "var(--tab-color-surface)",
  "--tab-text-muted": "var(--tab-color-line)",
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

test("financial-atelier tokens are exact, themed, accessible, and motion-aware", async () => {
  const implementation = await loadImplementation();
  const publicApi = await import(PUBLIC_API_URL.href);
  const css = await readFile(THEME_STYLES_URL, "utf8");

  assert.deepEqual(implementation.TAB_PALETTE, expectedPalette);
  assert.deepEqual(implementation.TAB_FONT_ROLES, expectedFontRoles);
  assert.deepEqual(implementation.TAB_THEME_MODES, ["light", "dark", "system"]);
  assert.deepEqual(implementation.TAB_LIGHT_THEME, expectedLightTheme);
  assert.deepEqual(implementation.TAB_DARK_THEME, expectedDarkTheme);
  assert.deepEqual(implementation.TAB_FOCUS_TOKENS, {
    color: "#3157E8",
    offset: "3px",
    width: "2px",
  });
  assert.deepEqual(Object.keys(implementation.TAB_MOTION_TOKENS).sort(), [
    "durationBase",
    "durationFast",
    "durationSlow",
    "easing",
    "flowlineDrawDuration",
    "travelDistance",
  ]);
  assert.match(implementation.TAB_MOTION_TOKENS.durationFast, /^\d+ms$/);
  assert.match(implementation.TAB_MOTION_TOKENS.durationBase, /^\d+ms$/);
  assert.match(implementation.TAB_MOTION_TOKENS.durationSlow, /^\d+ms$/);
  assert.match(implementation.TAB_MOTION_TOKENS.easing, /^(cubic-bezier|linear)\(/);
  assert.match(implementation.TAB_MOTION_TOKENS.flowlineDrawDuration, /^\d+ms$/);
  assert.match(implementation.TAB_MOTION_TOKENS.travelDistance, /^\d+px$/);
  assert.deepEqual(implementation.TAB_REDUCED_MOTION_TOKENS, {
    durationBase: "1ms",
    durationFast: "1ms",
    durationSlow: "1ms",
    flowlineDrawDuration: "1ms",
    travelDistance: "0px",
  });

  for (const value of [
    implementation.TAB_PALETTE,
    implementation.TAB_FONT_ROLES,
    implementation.TAB_THEME_MODES,
    implementation.TAB_LIGHT_THEME,
    implementation.TAB_DARK_THEME,
    implementation.TAB_FOCUS_TOKENS,
    implementation.TAB_MOTION_TOKENS,
    implementation.TAB_REDUCED_MOTION_TOKENS,
  ]) {
    assert.equal(Object.isFrozen(value), true);
  }

  const baseDeclarations = assertDeclarations(css, "[data-tab-ui]", {
    "--tab-color-cobalt": "#3157E8",
    "--tab-color-danger": "#B83F4A",
    "--tab-color-emerald": "#1F7A4D",
    "--tab-color-ink": "#15130F",
    "--tab-color-line": "#DDD6C8",
    "--tab-color-muted": "#6C665C",
    "--tab-color-paper": "#F4F0E7",
    "--tab-color-surface": "#FFFCF7",
    "--tab-color-testnet-amber": "#9A6400",
    "--tab-focus-color": "var(--tab-color-cobalt)",
    "--tab-focus-offset": "3px",
    "--tab-focus-width": "2px",
    "--tab-font-evidence": '"Geist Mono", "SFMono-Regular", Consolas, monospace',
    "--tab-font-marketing-emphasis": '"Instrument Serif", Georgia, serif',
    "--tab-font-product": '"Instrument Sans", "Helvetica Neue", Arial, sans-serif',
  });
  assert.match(baseDeclarations["--tab-motion-duration-fast"], /^\d+ms$/);
  assert.match(baseDeclarations["--tab-motion-duration-base"], /^\d+ms$/);
  assert.match(baseDeclarations["--tab-motion-duration-slow"], /^\d+ms$/);
  assert.match(baseDeclarations["--tab-motion-easing"], /^(cubic-bezier|linear)\(/);
  assert.match(baseDeclarations["--tab-flowline-draw-duration"], /^\d+ms$/);
  assert.match(baseDeclarations["--tab-motion-travel-distance"], /^\d+px$/);

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
  });

  const defaultTheme = publicApi.TabThemeProvider({ children: "Tab" });
  assert.equal(defaultTheme.type, "div");
  assert.equal(defaultTheme.props["data-tab-ui"], "");
  assert.equal(defaultTheme.props["data-tab-theme"], "system");
  assert.equal(defaultTheme.props.children, "Tab");

  const darkTheme = publicApi.TabThemeProvider({ children: null, id: "ui-root", theme: "dark" });
  assert.equal(darkTheme.props.id, "ui-root");
  assert.equal(darkTheme.props["data-tab-theme"], "dark");
  assert.throws(
    () => publicApi.TabThemeProvider({ children: null, theme: "sepia" }),
    (error) =>
      error instanceof publicApi.InvalidTabThemeError &&
      error.message === "The Tab theme must be light, dark, or system.",
  );
});
