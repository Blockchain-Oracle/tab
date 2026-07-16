const dateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
  timeZoneName: "short",
  year: "numeric",
});

export function formatDate(value: Date) {
  return dateFormatter.format(value);
}

export function formatUsd(value: string) {
  const [whole = "0", fraction = ""] = value.split(".");
  const micros = BigInt(whole) * BigInt(1_000_000) + BigInt(fraction.padEnd(6, "0").slice(0, 6));
  const cents = (micros + BigInt(5_000)) / BigInt(10_000);
  return `$${(cents / BigInt(100)).toLocaleString("en-US")}.${(cents % BigInt(100))
    .toString()
    .padStart(2, "0")}`;
}

export function formatTokenAmount(value: string) {
  const [whole, fraction = ""] = value.split(".");
  const significant = fraction.replace(/0+$/, "");
  return significant ? `${whole}.${significant}` : `${whole}.00`;
}

export function compact(value: string) {
  if (value.length <= 22) return value;
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}
