function nonnegativeInteger(value: string, field: string) {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${field} must be a nonnegative integer`);
  }
  return BigInt(value);
}

function grouped(value: bigint) {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatUsdCents(value: string) {
  const cents = nonnegativeInteger(value, "USD cents");
  return `$${grouped(cents / BigInt(100))}.${(cents % BigInt(100)).toString().padStart(2, "0")}`;
}

export function formatUsdAtomic(value: string) {
  const atomic = nonnegativeInteger(value, "USDC atomic units");
  const roundedCents = (atomic + BigInt(5_000)) / BigInt(10_000);
  return formatUsdCents(roundedCents.toString());
}

function percentParts(basisPoints: bigint) {
  const whole = basisPoints / BigInt(100);
  const fraction = (basisPoints % BigInt(100)).toString().padStart(2, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}%` : `${whole}%`;
}

export function formatBasisPoints(value: string) {
  return percentParts(nonnegativeInteger(value, "basis points"));
}

export function capFillWidth(value: string) {
  const basisPoints = nonnegativeInteger(value, "basis points");
  return percentParts(basisPoints > BigInt(10_000) ? BigInt(10_000) : basisPoints);
}

export function formatCycleFrequency(frequency: "daily" | "weekly" | "monthly" | "never") {
  if (frequency === "never") return "No automatic reset";
  return `${frequency.charAt(0).toUpperCase()}${frequency.slice(1)}`;
}

export function formatRemaining(nextResetAt: Date | null, now = new Date()) {
  if (!nextResetAt) return "No scheduled reset";
  const milliseconds = nextResetAt.getTime() - now.getTime();
  if (milliseconds <= 0) return "Reset due";
  const totalMinutes = Math.ceil(milliseconds / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts = [days ? `${days}d` : "", hours ? `${hours}h` : "", `${minutes}m`].filter(Boolean);
  return `in ${parts.join(" ")}`;
}
