import type {
  DashboardPayerType,
  DashboardPaymentStatus,
  DashboardTransactionQuery,
  DashboardWebhookResult,
} from "./dashboard-transactions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_STATUSES = new Set<DashboardPaymentStatus>(["failed", "pending", "settled"]);
const PAYER_TYPES = new Set<DashboardPayerType>(["agent", "human"]);
const WEBHOOK_RESULTS = new Set<DashboardWebhookResult>([
  "delivered",
  "failed",
  "gave_up",
  "none",
  "pending",
  "retrying",
  "timeout",
]);

export type DashboardTransactionRawSearch = Record<string, string | string[] | undefined>;

export interface DashboardTransactionSearch extends DashboardTransactionQuery {
  detail?: string;
}

function scalar(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export function parseDashboardTransactionSearch(
  raw: DashboardTransactionRawSearch,
): DashboardTransactionSearch {
  const cursor = scalar(raw.cursor);
  const detail = scalar(raw.detail);
  const payer = scalar(raw.payer) as DashboardPayerType | undefined;
  const status = scalar(raw.status) as DashboardPaymentStatus | undefined;
  const webhook = scalar(raw.webhook) as DashboardWebhookResult | undefined;

  return {
    ...(cursor && cursor.length <= 512 ? { cursor } : {}),
    ...(detail && UUID.test(detail) ? { detail } : {}),
    ...(payer && PAYER_TYPES.has(payer) ? { payerType: payer } : {}),
    ...(status && PAYMENT_STATUSES.has(status) ? { status } : {}),
    ...(webhook && WEBHOOK_RESULTS.has(webhook) ? { webhookResult: webhook } : {}),
  };
}

type SearchChange = {
  [Key in keyof DashboardTransactionSearch]?: DashboardTransactionSearch[Key] | null;
};

export function transactionsHref(search: DashboardTransactionSearch, changes: SearchChange = {}) {
  const next = { ...search, ...changes };
  const params = new URLSearchParams();
  if (next.status) params.set("status", next.status);
  if (next.payerType) params.set("payer", next.payerType);
  if (next.webhookResult) params.set("webhook", next.webhookResult);
  if (next.cursor) params.set("cursor", next.cursor);
  if (next.detail) params.set("detail", next.detail);
  const query = params.toString();
  return query ? `/dashboard/transactions?${query}` : "/dashboard/transactions";
}
