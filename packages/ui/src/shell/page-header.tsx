"use client";

import { type ReactElement, type ReactNode, useEffect, useRef, useState } from "react";

export interface PageHeaderProps {
  actions?: ReactNode;
  eyebrow?: string;
  meta?: ReactNode;
  title: ReactNode;
}

/**
 * Sticky page header inside the shell's scroll container. A sentinel above
 * it flips `data-stuck` so the bottom hairline fades in only while stuck.
 */
export function PageHeader({ actions, eyebrow, meta, title }: PageHeaderProps): ReactElement {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setStuck(entry ? !entry.isIntersecting : false),
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div aria-hidden="true" data-tab-page-sentinel="" ref={sentinelRef} />
      <header data-stuck={stuck ? "" : undefined} data-tab-page-header="">
        {eyebrow ? <p data-tab-page-eyebrow="">{eyebrow}</p> : null}
        <div data-tab-page-row="">
          <h1 data-tab-page-title="">{title}</h1>
          {actions ? <div data-tab-page-actions="">{actions}</div> : null}
        </div>
        {meta ? <p data-tab-page-meta="">{meta}</p> : null}
      </header>
    </>
  );
}
