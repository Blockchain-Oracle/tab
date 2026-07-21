import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

/** The Tab tally: four strokes and the vermilion slash. */
function TabMark() {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative, aria-hidden brand mark beside the visible wordmark.
    <svg aria-hidden height="20" viewBox="0 0 24 24" width="20">
      <g stroke="currentColor" strokeLinecap="round" strokeWidth="2.2">
        <path d="M5 5v14" />
        <path d="M10 5v14" />
        <path d="M15 5v14" />
        <path d="M20 5v14" />
      </g>
      <path d="M2 17 22 7" stroke="#e8501f" strokeLinecap="round" strokeWidth="2.4" />
    </svg>
  );
}

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000";

export function baseOptions(): BaseLayoutProps {
  return {
    links: [{ external: true, text: "Dashboard", url: APP_ORIGIN }],
    nav: {
      title: (
        <>
          <TabMark />
          <span style={{ fontWeight: 640, letterSpacing: "-0.02em" }}>Tab Docs</span>
        </>
      ),
    },
  };
}
