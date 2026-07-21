"use client";

import type { ReactElement } from "react";

export interface RollingAmountProps {
  className?: string | undefined;
  value: string;
}

/**
 * A figure that rolls once when its value changes — the ledger moving as
 * money moves. Keyed on the value so the roll fires exactly on real change
 * events; static under reduced motion. Use ONLY for event-driven figures.
 */
export function RollingAmount({ className, value }: RollingAmountProps): ReactElement {
  return (
    <span className={className} data-tab-rolling-amount="">
      <span data-tab-rolling-value="" key={value}>
        {value}
      </span>
    </span>
  );
}
