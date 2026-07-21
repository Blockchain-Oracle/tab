"use client";

import { useCallback, useSyncExternalStore } from "react";

const COOKIE = "tab_theme";
const EVENT = "tab-theme-change";

function readTheme(): "dark" | "light" {
  if (typeof document === "undefined") return "light";
  return document.body.getAttribute("data-tab-theme") === "dark" ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

/**
 * Light/dark toggle: flips the body attribute live and persists via cookie
 * so the server renders the chosen theme on the next request. Toggling
 * never replays entrance motion — the attribute swap only recolors.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "light");

  const toggle = useCallback(() => {
    const next = readTheme() === "dark" ? "light" : "dark";
    document.body.setAttribute("data-tab-theme", next);
    // biome-ignore lint/suspicious/noDocumentCookie: deliberate client-side persistence; CookieStore lacks universal support and no server round-trip is wanted here.
    document.cookie = `${COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return (
    <button
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      data-tab-theme-toggle=""
      onClick={toggle}
      type="button"
    >
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}
