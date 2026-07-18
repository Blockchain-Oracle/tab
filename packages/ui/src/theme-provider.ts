import { createElement, type HTMLAttributes, type ReactNode } from "react";

import { TAB_THEME_MODES, type TabThemeMode } from "./tokens.ts";

export interface TabThemeProviderProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  children?: ReactNode;
  theme?: TabThemeMode;
}

export class InvalidTabThemeError extends Error {
  constructor() {
    super("The Tab theme must be light, dark, or system.");
    this.name = "InvalidTabThemeError";
  }
}

function isTabThemeMode(value: string): value is TabThemeMode {
  return TAB_THEME_MODES.some((theme) => theme === value);
}

export function TabThemeProvider({
  children,
  theme = "system",
  ...elementProps
}: TabThemeProviderProps) {
  if (!isTabThemeMode(theme)) throw new InvalidTabThemeError();

  return createElement(
    "div",
    {
      ...elementProps,
      "data-tab-theme": theme,
      "data-tab-ui": "",
    },
    children,
  );
}
