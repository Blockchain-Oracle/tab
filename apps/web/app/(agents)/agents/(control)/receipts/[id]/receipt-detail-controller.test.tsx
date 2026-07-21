/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RECEIPT_POLL_INTERVAL_MS,
  RECEIPT_REQUEST_TIMEOUT_MS,
  type ReceiptItem,
} from "../../receipt-client";
import { ReceiptDetail } from "./receipt-detail-controller";

const item: ReceiptItem = {
  amountAtomic: "420000",
  amountDisplay: "$0.42",
  amountUsd: "0.420000",
  asset: "USDC",
  capContext: null,
  createdAt: "2026-07-17T10:00:00.000Z",
  explorer: null,
  id: "22222222-2222-4222-8222-222222222222",
  network: { id: "eip155:8453", label: "Base", target: false },
  origin: null,
  payTo: "0x1111111111111111111111111111111111111111",
  reason: null,
  resourceHost: "api.example.test",
  resourceUrl: "https://api.example.test/search",
  settledAt: null,
  status: "pending",
  txHash: null,
};

function detailResponse() {
  return Promise.resolve(new Response(JSON.stringify({ receipt: item }), { status: 200 }));
}

function abortableHang(signals: AbortSignal[]) {
  return (_input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal;
    if (signal) signals.push(signal);
    return new Promise<Response>((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  };
}

describe("receipt detail polling", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("times out a hung request and recovers on the next polling cadence", async () => {
    const signals: AbortSignal[] = [];
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(abortableHang(signals))
      .mockImplementationOnce(() => detailResponse());
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(<ReceiptDetail backAgentId={null} receiptId={item.id} />));

    await act(async () => vi.advanceTimersByTimeAsync(RECEIPT_REQUEST_TIMEOUT_MS));
    expect(signals[0]?.aborted).toBe(true);
    expect(container.textContent).toContain("Receipt refresh timed out");
    await act(async () => vi.advanceTimersByTimeAsync(RECEIPT_POLL_INTERVAL_MS));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("$0.42");
    expect(container.textContent).not.toContain("Receipt refresh timed out");
  });
});
