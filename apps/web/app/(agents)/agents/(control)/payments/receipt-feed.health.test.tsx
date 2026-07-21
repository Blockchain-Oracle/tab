/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RECEIPT_FEED_STALE_AFTER_MS,
  RECEIPT_POLL_INTERVAL_MS,
  RECEIPT_REQUEST_TIMEOUT_MS,
  type ReceiptItem,
} from "../receipt-client";
import { ReceiptFeed } from "./receipt-feed";

const agentId = "11111111-1111-4111-8111-111111111111";
const start = new Date("2026-07-17T10:00:00.000Z");

function receipt(): ReceiptItem {
  return {
    amountAtomic: "420000",
    amountDisplay: "$0.42",
    amountUsd: "0.420000",
    asset: "USDC",
    capContext: null,
    createdAt: start.toISOString(),
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
}

function ok(receipts: ReceiptItem[] = [receipt()]) {
  return Promise.resolve(
    new Response(JSON.stringify({ nextCursor: null, receipts }), { status: 200 }),
  );
}

function capOk(resetNotice: { reason: "manual"; resetAt: string } | null = null) {
  return Promise.resolve(
    new Response(JSON.stringify({ policy: null, resetNotice }), { status: 200 }),
  );
}

function hangingRequest(signals: AbortSignal[]) {
  return (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.signal) signals.push(init.signal);
    return new Promise<Response>(() => undefined);
  };
}

async function tick(milliseconds = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

describe("receipt feed live health", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(start);
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

  it("connects, expires a hung poll, times it out, then recovers without overlapping", async () => {
    const signals: AbortSignal[] = [];
    let resolveInitial: (value: Response) => void = () => undefined;
    const initial = new Promise<Response>((resolve) => {
      resolveInitial = resolve;
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => initial)
      .mockImplementationOnce(() => capOk())
      .mockImplementationOnce(hangingRequest(signals))
      .mockImplementationOnce(() => capOk())
      .mockImplementationOnce(() => ok())
      .mockImplementationOnce(() =>
        capOk({ reason: "manual", resetAt: "2026-07-17T10:00:18.000Z" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await act(async () =>
      root.render(
        <ReceiptFeed
          agentId={agentId}
          capResetNotice={null}
          initialResult={{ nextCursor: null, receipts: [] }}
        />,
      ),
    );
    expect(container.textContent).toContain("Connecting");
    await act(async () => resolveInitial(await ok()));
    expect(container.textContent).toContain("Live");
    expect(container.textContent).toContain("Last success 10:00:00 UTC");
    const liveRegion = container.querySelector('[role="status"]');
    expect(liveRegion?.textContent).toBe("Live");
    expect(liveRegion?.textContent).not.toContain("Last success");

    await tick(RECEIPT_POLL_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await tick(RECEIPT_FEED_STALE_AFTER_MS - RECEIPT_POLL_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(container.textContent).toContain("Updates paused");
    expect(container.textContent).toContain("api.example.test");

    await tick(RECEIPT_REQUEST_TIMEOUT_MS - RECEIPT_FEED_STALE_AFTER_MS + RECEIPT_POLL_INTERVAL_MS);
    expect(signals[0]?.aborted).toBe(true);
    expect(container.textContent).toContain("poll timed out");
    await tick(RECEIPT_POLL_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(container.textContent).toContain("Live");
    expect(container.textContent).toContain("Last success 10:00:18 UTC");
    expect(container.textContent).toContain("Reset manually");
    expect(container.textContent).toContain("This cycle’s spend counts from that boundary.");
  });

  it("aborts an initial hung request and stops polling when unmounted", async () => {
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(hangingRequest(signals));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () =>
      root.render(
        <ReceiptFeed
          agentId={agentId}
          capResetNotice={null}
          initialResult={{ nextCursor: null, receipts: [] }}
        />,
      ),
    );

    expect(container.textContent).toContain("Connecting");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
    expect(signals[0]?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(RECEIPT_REQUEST_TIMEOUT_MS * 2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    root = createRoot(container);
  });
});
