import {
  RECEIPT_FEED_STALE_AFTER_MS,
  type ReceiptFeedState,
  type ReceiptItem,
  type ReceiptResult,
} from "../../(agents)/agents/(control)/receipt-client";

type MobileReceiptRequest = (
  input: string,
  init?: RequestInit,
) => Promise<Pick<Response, "json" | "ok" | "status">>;

type MobileReceiptFeedAction =
  | { checkedAt: number; type: "health_checked" }
  | { message: string; type: "poll_failed" }
  | { receivedAt: number; result: ReceiptResult; type: "poll_succeeded" };

const EMPTY_RESULT: ReceiptResult = { nextCursor: null, receipts: [] };

function newestFirst(left: ReceiptItem, right: ReceiptItem) {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);
  const timeDifference =
    Number.isFinite(leftTime) && Number.isFinite(rightTime) ? rightTime - leftTime : 0;
  return timeDifference || right.id.localeCompare(left.id);
}

function normalizeResult(result: ReceiptResult): ReceiptResult {
  return { ...result, receipts: [...result.receipts].sort(newestFirst) };
}

function isReceiptStatus(value: unknown): value is ReceiptItem["status"] {
  return value === "blocked" || value === "failed" || value === "pending" || value === "settled";
}

function isReceiptItem(value: unknown): value is ReceiptItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<ReceiptItem>;
  return (
    typeof item.id === "string" &&
    typeof item.createdAt === "string" &&
    typeof item.amountDisplay === "string" &&
    typeof item.resourceHost !== "undefined" &&
    isReceiptStatus(item.status) &&
    typeof item.network === "object" &&
    item.network !== null &&
    typeof item.network.label === "string"
  );
}

function parseReceiptResult(value: unknown): ReceiptResult {
  if (typeof value !== "object" || value === null) {
    throw new Error("Payment receipts could not be refreshed.");
  }
  const result = value as { nextCursor?: unknown; receipts?: unknown };
  if (
    !Array.isArray(result.receipts) ||
    !result.receipts.every(isReceiptItem) ||
    (result.nextCursor !== null && typeof result.nextCursor !== "string")
  ) {
    throw new Error("Payment receipts could not be refreshed.");
  }
  return normalizeResult({ nextCursor: result.nextCursor, receipts: result.receipts });
}

export function initialMobileReceiptFeedState(result: ReceiptResult | null): ReceiptFeedState {
  return {
    connection: "connecting",
    error: null,
    lastSuccessfulPollAt: null,
    result: normalizeResult(result ?? EMPTY_RESULT),
  };
}

export function mobileReceiptFeedReducer(
  state: ReceiptFeedState,
  action: MobileReceiptFeedAction,
): ReceiptFeedState {
  if (action.type === "health_checked") {
    const stale =
      state.connection === "live" &&
      state.lastSuccessfulPollAt !== null &&
      action.checkedAt - state.lastSuccessfulPollAt >= RECEIPT_FEED_STALE_AFTER_MS;
    return stale
      ? {
          ...state,
          connection: "retrying",
          error: "Live updates are delayed.",
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
    result: normalizeResult(action.result),
  };
}

export async function loadMobileReceiptResult({
  agentId,
  onAuthExpired,
  request = fetch,
  signal,
}: {
  agentId: string;
  onAuthExpired?: () => void;
  request?: MobileReceiptRequest;
  signal?: AbortSignal;
}): Promise<ReceiptResult> {
  const query = new URLSearchParams({ agentId, limit: "100" });
  const response = await request(`/api/agents/receipts?${query}`, {
    cache: "no-store",
    ...(signal ? { signal } : {}),
  });
  if (response.status === 401) {
    onAuthExpired?.();
    throw new Error("Your Agent session expired.");
  }
  if (!response.ok) throw new Error("Payment receipts could not be refreshed.");
  return parseReceiptResult(await response.json());
}
