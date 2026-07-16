"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./dashboard-controls.module.css";
import { announceDashboardModeChange, useDashboardModeRevalidation } from "./dashboard-mode-sync";
import { LiveModeDialog } from "./live-mode-dialog";

type DashboardModeControlProps = {
  liveActivated: boolean;
  mode: "live" | "test";
};

export function DashboardModeControl({ liveActivated, mode }: DashboardModeControlProps) {
  const router = useRouter();
  useDashboardModeRevalidation();
  const [confirmLive, setConfirmLive] = useState(false);
  const [error, setError] = useState<string>();
  const [switching, setSwitching] = useState(false);

  async function persistMode(nextMode: "live" | "test") {
    if (nextMode === mode || switching) return;
    setSwitching(true);
    setError(undefined);

    try {
      const response = await fetch("/api/mode", {
        body: JSON.stringify({ mode: nextMode }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error("Mode update failed");

      setConfirmLive(false);
      announceDashboardModeChange();
      router.refresh();
    } catch {
      setError("Couldn’t switch modes. Your previous mode is still active.");
    } finally {
      setSwitching(false);
    }
  }

  function changeMode(nextMode: "live" | "test") {
    if (nextMode === mode || switching) return;
    if (nextMode === "live") {
      if (liveActivated) setConfirmLive(true);
      else router.push("/dashboard/go-live");
      return;
    }
    void persistMode(nextMode);
  }

  return (
    <section aria-label="Dashboard environment">
      <div className={styles.modeLabel}>MODE</div>
      <div className={styles.modeControl}>
        <button
          aria-pressed={mode === "test"}
          className={mode === "test" ? styles.selectedTest : styles.modeButton}
          disabled={switching}
          onClick={() => changeMode("test")}
          type="button"
        >
          TEST
        </button>
        <button
          aria-describedby={!liveActivated ? "live-mode-note" : undefined}
          aria-pressed={mode === "live"}
          className={mode === "live" ? styles.selectedLive : styles.modeButton}
          disabled={switching}
          onClick={() => changeMode("live")}
          type="button"
        >
          LIVE
        </button>
      </div>
      {!liveActivated ? (
        <p className={styles.modeNote} id="live-mode-note">
          Complete Go Live setup before selecting production data.
        </p>
      ) : null}
      {error && !confirmLive ? (
        <p className={styles.controlError} role="alert">
          {error}
        </p>
      ) : null}

      {confirmLive ? (
        <LiveModeDialog
          error={error}
          onCancel={() => setConfirmLive(false)}
          onConfirm={() => void persistMode("live")}
          switching={switching}
        />
      ) : null}
    </section>
  );
}
