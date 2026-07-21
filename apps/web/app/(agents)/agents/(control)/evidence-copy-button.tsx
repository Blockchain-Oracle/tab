"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./evidence-copy-button.module.css";

type WriteText = (value: string) => Promise<unknown>;

export async function copyEvidence({
  onCopied,
  value,
  writeText = (text) => navigator.clipboard.writeText(text),
}: {
  onCopied: () => void;
  value: string;
  writeText?: WriteText;
}) {
  await writeText(value);
  onCopied();
}

export function EvidenceCopyButton({ label, value }: { label: string; value: string }) {
  const [state, setState] = useState<"copied" | "failed" | "idle">("idle");
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (resetTimer.current) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  async function copyValue() {
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    try {
      await copyEvidence({ onCopied: () => setState("copied"), value });
    } catch {
      setState("failed");
    }
    resetTimer.current = window.setTimeout(() => setState("idle"), 2_000);
  }

  const copy = state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy";
  return (
    <button
      aria-label={label}
      className={styles.button}
      onClick={() => void copyValue()}
      type="button"
    >
      <span aria-live="polite">{copy}</span>
    </button>
  );
}
