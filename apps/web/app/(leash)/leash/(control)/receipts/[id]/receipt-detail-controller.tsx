"use client";

import { useEffect, useState } from "react";

import {
  loadReceiptDetail,
  RECEIPT_POLL_INTERVAL_MS,
  RECEIPT_REQUEST_TIMEOUT_MS,
  type ReceiptItem,
} from "../../receipt-client";
import { ReceiptDetailView } from "./receipt-detail";

export function ReceiptDetail({
  backAgentId,
  receiptId,
}: {
  backAgentId: string | null;
  receiptId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [receipt, setReceipt] = useState<ReceiptItem | null>(null);
  useEffect(() => {
    let active = true;
    let inFlight = false;
    let nextPoll: number | null = null;
    let controller: AbortController | null = null;
    async function poll() {
      if (inFlight) return;
      inFlight = true;
      const pollController = new AbortController();
      controller = pollController;
      const timeout = window.setTimeout(() => pollController.abort(), RECEIPT_REQUEST_TIMEOUT_MS);
      try {
        const next = await loadReceiptDetail({ receiptId, signal: pollController.signal });
        if (active) {
          setReceipt(next);
          setError(null);
        }
      } catch (cause) {
        if (active) {
          setError(
            pollController.signal.aborted
              ? "Receipt refresh timed out."
              : cause instanceof Error
                ? cause.message
                : "This receipt could not be loaded.",
          );
        }
      } finally {
        window.clearTimeout(timeout);
        if (controller === pollController) controller = null;
        if (active) setLoading(false);
        inFlight = false;
        if (active) nextPoll = window.setTimeout(() => void poll(), RECEIPT_POLL_INTERVAL_MS);
      }
    }
    void poll();
    return () => {
      active = false;
      controller?.abort();
      if (nextPoll !== null) window.clearTimeout(nextPoll);
      inFlight = false;
    };
  }, [receiptId]);

  return (
    <ReceiptDetailView
      backAgentId={backAgentId}
      error={error}
      loading={loading}
      receipt={receipt}
    />
  );
}
