"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import styles from "./overview-live-health.module.css";

const POLL_INTERVAL_MS = 3_000;
const REQUEST_TIMEOUT_MS = 12_000;
type Health = "connecting" | "live" | "partial" | "retrying";

function healthCopy(health: Health) {
  if (health === "live") return "Live";
  if (health === "partial") return "Partial reads";
  if (health === "retrying") return "Updates delayed";
  return "Connecting";
}

export function OverviewLiveHealth({ agentId }: { agentId: string }) {
  const refresh = useRouter().refresh;
  const [health, setHealth] = useState<Health>("connecting");

  useEffect(() => {
    let active = true;
    let nextPoll: number | null = null;
    let controller: AbortController | null = null;

    async function poll() {
      controller = new AbortController();
      const query = new URLSearchParams({ agentId });
      const timeout = window.setTimeout(() => controller?.abort(), REQUEST_TIMEOUT_MS);
      try {
        const responses = await Promise.all([
          fetch(`/api/leash/receipts?${new URLSearchParams({ agentId, limit: "1" })}`, {
            cache: "no-store",
            signal: controller.signal,
          }),
          fetch(`/api/leash/caps?${query}`, { cache: "no-store", signal: controller.signal }),
          fetch(`/api/leash/float-balances?${query}`, {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);
        if (responses.some((response) => !response.ok)) {
          throw new Error("One or more overview reads failed.");
        }
        const floatResponse = responses[2];
        if (!floatResponse) throw new Error("The float read did not return a response.");
        const floatBody = (await floatResponse.json()) as { health?: unknown };
        if (active) {
          setHealth(floatBody.health === "healthy" ? "live" : "partial");
          refresh();
        }
      } catch {
        controller?.abort();
        if (active) setHealth("retrying");
      } finally {
        window.clearTimeout(timeout);
        controller = null;
        if (active) nextPoll = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
      }
    }

    void poll();
    return () => {
      active = false;
      controller?.abort();
      if (nextPoll !== null) window.clearTimeout(nextPoll);
    };
  }, [agentId, refresh]);

  return (
    <span aria-atomic="true" aria-live="polite" className={styles.liveHealth} role="status">
      <b className={styles[health]}>{healthCopy(health)}</b>
    </span>
  );
}
