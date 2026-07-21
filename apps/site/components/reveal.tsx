"use client";

import { type ReactNode, useEffect, useRef } from "react";

interface RevealProps {
  as?: "div" | "section" | "figure" | "li" | "span";
  children: ReactNode;
  className?: string;
  /** Stagger delay applied via the --k-delay custom property. */
  delayMs?: number;
}

/**
 * Adds `.is-in` once the element scrolls into view. Pairs with the
 * `.reveal` / `.stamp` rules in kinetic.css, which only hide content under
 * the `data-tab-hero-motion` gate — so no-JS and reduced-motion visitors
 * always see the final state.
 */
export function Reveal({ as = "div", children, className = "", delayMs }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.2 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const Tag = as;
  return (
    <Tag
      className={className}
      ref={ref as never}
      style={delayMs ? ({ "--k-delay": `${delayMs}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}
