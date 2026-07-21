"use client";

import { TabThemeProvider } from "@tab/ui";
import { MotionConfig } from "motion/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

export type SiteTheme = "light" | "dark";

const STORAGE_KEY = "tab-site-theme";
const THEME_CHANGE_EVENT = "tab-site-theme-change";
const LIGHT_THEME: SiteTheme = "light";

interface SiteThemeContextValue {
  setTheme: (theme: SiteTheme) => void;
  theme: SiteTheme;
}

const SiteThemeContext = createContext<SiteThemeContextValue | null>(null);
let fallbackTheme: SiteTheme = LIGHT_THEME;

const bootstrapTheme = `(() => {
  try {
    const saved = window.localStorage.getItem("${STORAGE_KEY}");
    const theme = saved === "dark" ? "dark" : "light";
    document.currentScript?.parentElement?.setAttribute("data-tab-theme", theme);
  } catch {}
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.documentElement.setAttribute("data-tab-hero-motion", "pending");
  }
})();`;

function readTheme(): SiteTheme {
  if (typeof window === "undefined") return LIGHT_THEME;

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === "dark" ? "dark" : LIGHT_THEME;
  } catch {
    return fallbackTheme;
  }
}

function subscribeToTheme(onStoreChange: () => void) {
  function handleStorage(event: StorageEvent) {
    if (event.key === STORAGE_KEY) onStoreChange();
  }

  window.addEventListener("storage", handleStorage);
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
  };
}

export function ThemeShell({ children }: Readonly<{ children: ReactNode }>) {
  const theme = useSyncExternalStore(subscribeToTheme, readTheme, () => LIGHT_THEME);
  const setTheme = useCallback((nextTheme: SiteTheme) => {
    fallbackTheme = nextTheme;

    try {
      window.localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch {
      // The in-memory fallback still lets this tab change theme when storage is unavailable.
    }

    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);
  const contextValue = useMemo(() => ({ setTheme, theme }), [setTheme, theme]);

  return (
    <SiteThemeContext.Provider value={contextValue}>
      <MotionConfig reducedMotion="user">
        <TabThemeProvider className="site-shell" suppressHydrationWarning={true} theme={theme}>
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Static, source-owned bootstrap prevents a persisted-theme flash before hydration. */}
          <script dangerouslySetInnerHTML={{ __html: bootstrapTheme }} />
          {children}
        </TabThemeProvider>
      </MotionConfig>
    </SiteThemeContext.Provider>
  );
}

export function useSiteTheme() {
  const context = useContext(SiteThemeContext);
  if (!context) throw new Error("useSiteTheme must be used inside ThemeShell.");
  return context;
}
