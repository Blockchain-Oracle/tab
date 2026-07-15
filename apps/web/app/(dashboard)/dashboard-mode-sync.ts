"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const CHANNEL_NAME = "tab-dashboard-mode";
const STORAGE_KEY = "tab:mode-changed-at";

export function announceDashboardModeChange() {
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage("changed");
    channel.close();
  } catch {
    // The storage event below is the compatibility fallback.
  }

  try {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
  } catch {
    // Focus and visibility revalidation still protect unsupported browsers.
  }
}

export function useDashboardModeRevalidation() {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => router.refresh();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) refresh();
    };
    let channel: BroadcastChannel | undefined;

    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.addEventListener("message", refresh);
    } catch {
      channel = undefined;
    }

    window.addEventListener("focus", refresh);
    window.addEventListener("storage", handleStorage);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      channel?.removeEventListener("message", refresh);
      channel?.close();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [router]);
}
