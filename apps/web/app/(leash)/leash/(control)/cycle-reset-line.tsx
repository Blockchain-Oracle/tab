"use client";

import { useEffect, useState } from "react";

import { formatCycleFrequency, formatRemaining } from "../../../../lib/leash/leash-format";

export function CycleResetLine({
  frequency,
  nextResetAt,
}: {
  frequency: "daily" | "weekly" | "monthly" | "never";
  nextResetAt: string | null;
}) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!nextResetAt) return <span>{formatCycleFrequency(frequency)} · no scheduled reset</span>;
  return (
    <span>
      {formatCycleFrequency(frequency)} ·{" "}
      {now ? formatRemaining(new Date(nextResetAt), now) : "Countdown starting…"} · next{" "}
      <time dateTime={nextResetAt}>{nextResetAt}</time>
    </span>
  );
}
