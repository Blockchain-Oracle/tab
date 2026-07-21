"use client";

import { useEffect, useRef, useState } from "react";

import { LiveRegion } from "./status.tsx";

type CopyResult = "idle" | "success" | "failure";

export interface CopyControlProps {
  copyText?: (value: string) => Promise<void>;
  failureMessage: string;
  label: string;
  successMessage: string;
  value: string;
}

async function writeToClipboard(value: string) {
  if (!globalThis.navigator?.clipboard?.writeText) {
    throw new Error("Clipboard access is unavailable.");
  }
  await globalThis.navigator.clipboard.writeText(value);
}

export function CopyControl({
  copyText = writeToClipboard,
  failureMessage,
  label,
  successMessage,
  value,
}: CopyControlProps) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CopyResult>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  async function copy() {
    if (busy) return;
    setBusy(true);
    setResult("idle");
    if (resetTimer.current) clearTimeout(resetTimer.current);
    try {
      await copyText(value);
      setResult("success");
      // "Copied" must never become a permanent dead state.
      resetTimer.current = setTimeout(() => setResult("idle"), 2_000);
    } catch {
      setResult("failure");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span data-tab-copy-control="">
      <button aria-busy={busy} disabled={busy} onClick={copy} type="button">
        {label}
      </button>
      <LiveRegion priority={result === "failure" ? "urgent" : "polite"}>
        {result === "success" ? successMessage : null}
        {result === "failure" ? failureMessage : null}
      </LiveRegion>
    </span>
  );
}
