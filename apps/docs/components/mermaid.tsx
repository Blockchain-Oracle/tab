"use client";

import { useEffect, useId, useState } from "react";

function useDocsTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setDark(root.classList.contains("dark"));
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributeFilter: ["class"], attributes: true });
    return () => observer.disconnect();
  }, []);
  return dark;
}

/** Client-rendered mermaid diagram — Ink & Evidence in BOTH themes, full width. */
export function Mermaid({ chart }: { chart: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const dark = useDocsTheme();
  const [svg, setSvg] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({
        fontSize: 16,
        startOnLoad: false,
        theme: "base",
        themeVariables: dark
          ? {
              actorTextColor: "#f2efe9",
              fontFamily: "Instrument Sans, Helvetica, Arial, sans-serif",
              fontSize: "16px",
              labelTextColor: "#f2efe9",
              lineColor: "#a9a399",
              noteBkgColor: "#26221d",
              noteTextColor: "#f2efe9",
              primaryBorderColor: "#4a443c",
              primaryColor: "#26221d",
              primaryTextColor: "#f2efe9",
              secondaryColor: "#1c1915",
              signalColor: "#a9a399",
              signalTextColor: "#f2efe9",
              tertiaryColor: "#141210",
              textColor: "#f2efe9",
            }
          : {
              actorTextColor: "#161310",
              fontFamily: "Instrument Sans, Helvetica, Arial, sans-serif",
              fontSize: "16px",
              labelTextColor: "#161310",
              lineColor: "#6e6961",
              noteBkgColor: "#f1ede5",
              noteTextColor: "#161310",
              primaryBorderColor: "#d8d2c6",
              primaryColor: "#ffffff",
              primaryTextColor: "#161310",
              secondaryColor: "#f1ede5",
              signalColor: "#6e6961",
              signalTextColor: "#161310",
              tertiaryColor: "#faf8f3",
              textColor: "#161310",
            },
      });
      // Theme is part of the render id: mermaid caches by id, and we need a
      // fresh SVG when the viewer flips the theme toggle.
      const rendered = await mermaid.render(`m${id}${dark ? "d" : "l"}`, chart);
      if (!cancelled) setSvg(rendered.svg);
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, dark, id]);

  return (
    <div
      data-mermaid=""
      style={{
        background: "var(--color-fd-card)",
        border: "1px solid var(--color-fd-border)",
        borderRadius: 14,
        margin: "16px 0",
        overflowX: "auto",
        padding: 20,
      }}
    >
      <style>{`[data-mermaid] svg { display: block; width: 100%; height: auto; min-width: 640px; }`}</style>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid output from our own literal chart strings, never user input. */}
      <div dangerouslySetInnerHTML={svg ? { __html: svg } : undefined} />
    </div>
  );
}
