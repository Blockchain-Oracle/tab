const ABSOLUTE = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

const RELATIVE_STEPS = [
  { divisor: 1_000, limit: 60_000, unit: "s" },
  { divisor: 60_000, limit: 3_600_000, unit: "m" },
  { divisor: 3_600_000, limit: 86_400_000, unit: "h" },
] as const;

/**
 * One timestamp voice: relative under 24h ("4m ago"), absolute UTC beyond.
 * Callers put `absoluteUtc` in a `title`/`dateTime` attr so the precise
 * moment is always one hover away.
 */
export function formatTimestamp(value: Date, now: Date = new Date()) {
  const elapsed = now.getTime() - value.getTime();
  const absoluteUtc = `${ABSOLUTE.format(value)} UTC`;

  if (elapsed < 0 || elapsed >= 86_400_000) {
    return { absoluteUtc, display: absoluteUtc };
  }
  for (const step of RELATIVE_STEPS) {
    if (elapsed < step.limit) {
      return {
        absoluteUtc,
        display: `${Math.max(1, Math.floor(elapsed / step.divisor))}${step.unit} ago`,
      };
    }
  }
  return { absoluteUtc, display: `${Math.floor(elapsed / 3_600_000)}h ago` };
}
