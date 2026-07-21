"use client";

import { useState } from "react";

import styles from "./code-block.module.css";

export function CodeCopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard denied — selection still works.
    }
  }

  return (
    <button className={styles.copy} onClick={() => void copy()} type="button">
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
