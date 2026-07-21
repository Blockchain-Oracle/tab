"use client";

import { useEffect, useReducer, useState } from "react";

import type { CapResetNotice } from "../../../../../lib/leash/cap-reset-notice";
import type { CapPolicyView } from "../../../../../lib/leash/cap-view";
import {
  initialReceiptFeedState,
  loadCapSnapshot,
  loadReceiptResult,
  RECEIPT_POLL_INTERVAL_MS,
  RECEIPT_REQUEST_TIMEOUT_MS,
  type ReceiptResult,
  receiptFeedReducer,
} from "../receipt-client";
import { ReceiptFeedView } from "./receipt-feed-view";

export { ReceiptFeedView } from "./receipt-feed-view";

export function ReceiptFeed({
  agentId,
  capResetNotice,
  initialPolicy = null,
  initialResult,
}: {
  agentId: string;
  capResetNotice: CapResetNotice | null;
  initialPolicy?: CapPolicyView | null;
  initialResult: ReceiptResult;
}) {
  const [state, dispatch] = useReducer(receiptFeedReducer, initialResult, initialReceiptFeedState);
  const [policy, setPolicy] = useState(initialPolicy);
  const [resetNotice, setResetNotice] = useState(capResetNotice);
  const [retryVersion, retry] = useReducer((version: number) => version + 1, 0);

  // retryVersion deliberately tears down a failed poll and starts a fresh one immediately.
  // biome-ignore lint/correctness/useExhaustiveDependencies: explicit user retry trigger
  useEffect(() => {
    let active = true;
    let nextPollTimer: number | null = null;
    let cancelCurrentRequest: (() => void) | null = null;

    async function poll() {
      const controller = new AbortController();
      let timeoutTimer: number | null = null;
      let rejectDeadline: (reason: Error) => void = () => undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        rejectDeadline = reject;
        timeoutTimer = window.setTimeout(() => {
          controller.abort();
          reject(new Error("Payment receipt poll timed out."));
        }, RECEIPT_REQUEST_TIMEOUT_MS);
      });
      cancelCurrentRequest = () => {
        controller.abort();
        rejectDeadline(new Error("Payment receipt polling stopped."));
      };

      try {
        const [result, cap] = await Promise.race([
          Promise.all([
            loadReceiptResult({ agentId, signal: controller.signal }),
            loadCapSnapshot({ agentId, signal: controller.signal }),
          ]),
          deadline,
        ]);
        if (active) {
          setPolicy(cap.policy);
          setResetNotice(cap.resetNotice);
          dispatch({ receivedAt: Date.now(), result, type: "poll_succeeded" });
        }
      } catch (error) {
        controller.abort();
        if (active) {
          dispatch({
            message:
              error instanceof Error ? error.message : "Payment receipts could not be loaded.",
            type: "poll_failed",
          });
        }
      } finally {
        if (timeoutTimer !== null) window.clearTimeout(timeoutTimer);
        cancelCurrentRequest = null;
        if (active)
          nextPollTimer = window.setTimeout(visibilityGatedPoll, RECEIPT_POLL_INTERVAL_MS);
      }
    }

    function visibilityGatedPoll() {
      if (document.hidden) {
        nextPollTimer = window.setTimeout(visibilityGatedPoll, RECEIPT_POLL_INTERVAL_MS);
        return;
      }
      void poll();
    }

    function onVisible() {
      if (!document.hidden && active && cancelCurrentRequest === null) {
        if (nextPollTimer !== null) window.clearTimeout(nextPollTimer);
        visibilityGatedPoll();
      }
    }

    document.addEventListener("visibilitychange", onVisible);
    visibilityGatedPoll();
    const healthTimer = window.setInterval(() => {
      if (!document.hidden) dispatch({ checkedAt: Date.now(), type: "health_checked" });
    }, RECEIPT_POLL_INTERVAL_MS);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
      cancelCurrentRequest?.();
      if (nextPollTimer !== null) window.clearTimeout(nextPollTimer);
      window.clearInterval(healthTimer);
    };
  }, [agentId, retryVersion]);

  return (
    <ReceiptFeedView
      agentId={agentId}
      capResetNotice={resetNotice}
      onRetry={retry}
      policy={policy}
      state={state}
    />
  );
}
