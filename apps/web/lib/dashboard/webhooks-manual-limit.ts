import type { Database } from "../db/client";
import {
  WEBHOOK_ROOT_CONCURRENCY_LIMIT,
  WEBHOOK_ROOT_RATE_LIMIT,
  WEBHOOK_ROOT_RATE_WINDOW_MS,
  webhookRootAdmissionAllowed,
} from "../webhooks/egress-limit";
import type { WebhookDashboardPrincipal } from "./webhooks-endpoints";
import { WebhookDashboardError } from "./webhooks-http";

type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const MANUAL_WEBHOOK_RATE_LIMIT = WEBHOOK_ROOT_RATE_LIMIT;
export const MANUAL_WEBHOOK_CONCURRENCY_LIMIT = WEBHOOK_ROOT_CONCURRENCY_LIMIT;
export const MANUAL_WEBHOOK_RATE_WINDOW_MS = WEBHOOK_ROOT_RATE_WINDOW_MS;

function limited() {
  return new WebhookDashboardError(
    "WEBHOOK_RATE_LIMITED",
    "Wait for current webhook attempts or try again later.",
    429,
  );
}

export async function withManualWebhookGrant<T>(
  db: Database,
  principal: WebhookDashboardPrincipal,
  create: (transaction: DatabaseTransaction) => Promise<T>,
) {
  return db.transaction(async (transaction) => {
    if (!(await webhookRootAdmissionAllowed(transaction, principal, "manual"))) throw limited();

    return create(transaction);
  });
}
