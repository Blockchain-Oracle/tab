"use client";

import { useEffect, useState } from "react";

function absoluteUtc(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function relative(value: string, now: number) {
  const seconds = Math.round((Date.parse(value) - now) / 1_000);
  const abs = Math.abs(seconds);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return formatter.format(seconds, "second");
  if (abs < 3_600) return formatter.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return formatter.format(Math.round(seconds / 3_600), "hour");
  return formatter.format(Math.round(seconds / 86_400), "day");
}

export function RelativeTime({ prefix, value }: { prefix: string; value: string }) {
  const [label, setLabel] = useState(`${prefix} at ${absoluteUtc(value)} UTC`);

  useEffect(() => {
    const update = () => setLabel(`${prefix} ${relative(value, Date.now())}`);
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, [prefix, value]);

  return <time dateTime={value}>{label}</time>;
}
