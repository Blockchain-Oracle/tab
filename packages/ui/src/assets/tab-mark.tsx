/* biome-ignore-all lint/a11y/noSvgWithoutTitle: markA11y()/a11y provides aria-hidden (decorative) or role="img" + aria-label (labeled) on every svg. */
import type { ReactElement } from "react";

import type { MarkProps } from "./marks";

/**
 * Tab's brand mark: a tally — four strokes and a slash, "keeping a tab."
 * Drawn in currentColor so it is ink in light mode and bone in dark mode.
 */
export function TabMark({ size = 20, title }: MarkProps): ReactElement {
  const a11y = title
    ? ({ role: "img", "aria-label": title } as const)
    : ({ "aria-hidden": true } as const);
  return (
    <svg
      {...a11y}
      data-tab-mark="tab"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2.6"
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <line x1="4.4" x2="4.4" y1="4.5" y2="19.5" />
      <line x1="9.47" x2="9.47" y1="4.5" y2="19.5" />
      <line x1="14.53" x2="14.53" y1="4.5" y2="19.5" />
      <line x1="19.6" x2="19.6" y1="4.5" y2="19.5" />
      <line x1="1.8" x2="22.2" y1="16.8" y2="7.2" />
    </svg>
  );
}
