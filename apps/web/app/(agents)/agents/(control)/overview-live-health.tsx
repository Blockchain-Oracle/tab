"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import styles from "./overview-live-health.module.css";

const POLL_INTERVAL_MS = 12_000;
const REQUEST_TIMEOUT_MS = 12_000;
/** Full server-component refreshes are capped to every Nth healthy poll. */
const REFRESH_EVERY_N_POLLS = 4;
type Health = "connecting" | "live" | "partial" | "retrying";

function healthCopy(health: Health) {
  if (health === "live") return "Live";
  if (health === "partial") return "Partial reads";
  if (health === "retrying") return "Updates delayed";
  return "Connecting";
}

/**
 * Overview liveness: ONE float-balances read per cycle (the health signal),
 * paused while the tab is hidden. `router.refresh()` — which re-runs every
 * server component including on-chain reads — fires only when health
 * changes or on a slow safety cadence, never per poll.
 */
export function OverviewLiveHealth({ agentId }: { agentId: string }) {
  const refresh = useRouter().refresh;
  const [health, setHealth] = useState<Health>("connecting");

  useEffect(() => {
    let active = true;
    let nextPoll: number | null = null;
    let controller: AbortController | null = null;
    let lastHealth: Health = "connecting";
    let pollsSinceRefresh = 0;

    async function poll() {
      if (document.hidden) {
        nextPoll = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
        return;
      }
      controller = new AbortController();
      const query = new URLSearchParams({ agentId });
      const timeout = window.setTimeout(() => controller?.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(`/api/agents/float-balances?${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("The float read failed.");
        const body = (await response.json()) as { health?: unknown };
        if (active) {
          const nextHealth: Health = body.health === "healthy" ? "live" : "partial";
          setHealth(nextHealth);
          pollsSinceRefresh += 1;
          if (nextHealth !== lastHealth || pollsSinceRefresh >= REFRESH_EVERY_N_POLLS) {
            pollsSinceRefresh = 0;
            refresh();
          }
          lastHealth = nextHealth;
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

    function onVisible() {
      if (!document.hidden && active && controller === null) {
        if (nextPoll !== null) window.clearTimeout(nextPoll);
        void poll();
      }
    }

    document.addEventListener("visibilitychange", onVisible);
    void poll();
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
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
