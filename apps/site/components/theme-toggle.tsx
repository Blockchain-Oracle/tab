"use client";

import { useSiteTheme } from "@/components/theme-shell";

function SunIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="3.25" />
      <path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6L16 16M16 4l-1.4 1.4M5.4 14.6L4 16" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M16.75 12.15A7 7 0 0 1 7.85 3.25a7 7 0 1 0 8.9 8.9Z" />
    </svg>
  );
}

export function ThemeToggle() {
  const { setTheme, theme } = useSiteTheme();
  const nextTheme = theme === "light" ? "dark" : "light";
  const currentLabel = theme === "light" ? "Light" : "Dark";
  const nextLabel = nextTheme === "light" ? "Light" : "Dark";

  return (
    <button
      aria-label={`Current theme: ${currentLabel}. Switch to ${nextLabel} theme.`}
      className="theme-toggle"
      onClick={() => setTheme(nextTheme)}
      type="button"
    >
      <span className="theme-toggle__icon">{theme === "light" ? <SunIcon /> : <MoonIcon />}</span>
      <span aria-hidden="true" className="theme-toggle__label">
        {currentLabel} <span className="theme-toggle__arrow">→</span> {nextLabel}
      </span>
    </button>
  );
}
