import type { CapResetNotice } from "../../../../lib/leash/cap-reset-notice";
import type { CapPolicyView } from "../../../../lib/leash/cap-view";

export type ReceiptStatus = "blocked" | "failed" | "pending" | "settled";
export const RECEIPT_POLL_INTERVAL_MS = 3_000;
// Three missed cadences are enough to stop making a live-data claim.
export const RECEIPT_FEED_STALE_AFTER_MS = RECEIPT_POLL_INTERVAL_MS * 3;
// A request gets one extra cadence to finish, then it is aborted so polling can recover.
export const RECEIPT_REQUEST_TIMEOUT_MS = RECEIPT_POLL_INTERVAL_MS * 4;

export interface ReceiptItem {
  amountAtomic: string;
  amountDisplay: string;
  amountUsd: string;
  asset: "USDC";
  capContext: {
    capAtomic: string;
    committedBeforeAtomic: string;
    projectedAfterAtomic: string;
  } | null;
  createdAt: string;
  explorer: { href: string; label: string } | null;
  id: string;
  network: {
    id: string | null;
    label: string;
    target: boolean;
    testFunds?: boolean;
    testFundsLabel?: string;
  };
  origin: { clientName?: string; toolName?: string; transport: "http" | "mcp" } | null;
  payTo: string;
  reason: string | null;
  resourceHost: string | null;
  resourceUrl: string | null;
  settledAt: string | null;
  status: ReceiptStatus;
  txHash: string | null;
}

export interface ReceiptResult {
  nextCursor: string | null;
  receipts: ReceiptItem[];
}

export interface ReceiptFeedState {
  connection: "connecting" | "live" | "retrying";
  error: string | null;
  lastSuccessfulPollAt: number | null;
  result: ReceiptResult;
}

type ReceiptRequest = (input: string, init?: RequestInit) => Promise<Pick<Response, "json" | "ok">>;
type FeedAction =
  | { checkedAt: number; type: "health_checked" }
  | { message: string; type: "poll_failed" }
  | { receivedAt: number; result: ReceiptResult; type: "poll_succeeded" };

function newestFirst(left: ReceiptItem, right: ReceiptItem) {
  const timeDifference = Date.parse(right.createdAt) - Date.parse(left.createdAt);
  return timeDifference || right.id.localeCompare(left.id);
}

function normalized(result: ReceiptResult): ReceiptResult {
  return { ...result, receipts: [...result.receipts].sort(newestFirst) };
}

function apiError(body: unknown, fallback: string) {
  if (typeof body !== "object" || body === null) return fallback;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return fallback;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : fallback;
}

export function initialReceiptFeedState(result: ReceiptResult): ReceiptFeedState {
  return {
    connection: "connecting",
    error: null,
    lastSuccessfulPollAt: null,
    result: normalized(result),
  };
}

export function receiptFeedReducer(state: ReceiptFeedState, action: FeedAction): ReceiptFeedState {
  if (action.type === "health_checked") {
    const expired =
      state.connection === "live" &&
      state.lastSuccessfulPollAt !== null &&
      action.checkedAt - state.lastSuccessfulPollAt >= RECEIPT_FEED_STALE_AFTER_MS;
    return expired
      ? {
          ...state,
          connection: "retrying",
          error: "Live updates are delayed. Showing the last successful receipt snapshot.",
        }
      : state;
  }
  if (action.type === "poll_failed") {
    return { ...state, connection: "retrying", error: action.message };
  }
  return {
    connection: "live",
    error: null,
    lastSuccessfulPollAt: action.receivedAt,
    result: normalized(action.result),
  };
}

export async function loadReceiptResult({
  agentId,
  request = fetch,
  signal,
}: {
  agentId: string;
  request?: ReceiptRequest;
  signal?: AbortSignal;
}) {
  const query = new URLSearchParams({ agentId, limit: "100" });
  const response = await request(`/api/leash/receipts?${query}`, {
    cache: "no-store",
    ...(signal ? { signal } : {}),
  });
  const body = (await response.json()) as ReceiptResult | unknown;
  if (!response.ok) throw new Error(apiError(body, "Payment receipts could not be loaded."));
  return normalized(body as ReceiptResult);
}

export async function loadCapSnapshot({
  agentId,
  request = fetch,
  signal,
}: {
  agentId: string;
  request?: ReceiptRequest;
  signal?: AbortSignal;
}): Promise<{ policy: CapPolicyView | null; resetNotice: CapResetNotice | null }> {
  const query = new URLSearchParams({ agentId });
  const response = await request(`/api/leash/caps?${query}`, {
    cache: "no-store",
    ...(signal ? { signal } : {}),
  });
  const body = (await response.json()) as {
    error?: unknown;
    policy?: CapPolicyView | null;
    resetNotice?: CapResetNotice | null;
  };
  if (!response.ok) throw new Error(apiError(body, "Cap status could not be loaded."));
  if (!("policy" in body)) throw new Error("Cap status could not be loaded.");
  return { policy: body.policy ?? null, resetNotice: body.resetNotice ?? null };
}

export async function loadCapPolicy(
  input: Parameters<typeof loadCapSnapshot>[0],
): Promise<CapPolicyView | null> {
  return (await loadCapSnapshot(input)).policy;
}

export async function loadReceiptDetail({
  receiptId,
  request = fetch,
  signal,
}: {
  receiptId: string;
  request?: ReceiptRequest;
  signal?: AbortSignal;
}) {
  const response = await request(`/api/leash/receipts/${encodeURIComponent(receiptId)}`, {
    cache: "no-store",
    ...(signal ? { signal } : {}),
  });
  const body = (await response.json()) as { error?: unknown; receipt?: ReceiptItem };
  if (!response.ok) throw new Error(apiError(body, "This receipt could not be loaded."));
  if (!body.receipt) throw new Error("This receipt could not be loaded.");
  return body.receipt;
}
