import type { Database } from "../db/client";
import { dispatchWebhookDeliveryById } from "./deliver";
import { findClaimableWebhookDeliveryId } from "./delivery-store";
import { promoteDueWebhookRetry } from "./retry-ledger";

const DEFAULT_MAX_DELIVERIES = 4;
const HARD_MAX_DELIVERIES = 25;

export interface WebhookQueueDrainOptions {
  allowLocalHttp?: boolean;
  maxDeliveries?: number;
}

function deliveryBound(value: number | undefined) {
  const bound = value ?? DEFAULT_MAX_DELIVERIES;
  if (!Number.isSafeInteger(bound) || bound < 1 || bound > HARD_MAX_DELIVERIES) {
    throw new Error("Webhook delivery batch bound is invalid");
  }
  return bound;
}

async function nextWork(db: Database, preferRetry: boolean) {
  if (preferRetry) {
    const retry = await promoteDueWebhookRetry(db);
    if (retry) return { id: retry.id, promoted: true };
  }

  const pendingId = await findClaimableWebhookDeliveryId(db);
  if (pendingId) return { id: pendingId, promoted: false };
  if (!preferRetry) {
    const retry = await promoteDueWebhookRetry(db);
    if (retry) return { id: retry.id, promoted: true };
  }
  return null;
}

export async function drainWebhookDeliveryQueue(
  db: Database,
  options: WebhookQueueDrainOptions = {},
) {
  const maxDeliveries = deliveryBound(options.maxDeliveries);
  let claimed = 0;
  let examined = 0;
  let finalized = 0;
  let promoted = 0;
  let preferRetry = false;

  while (examined < maxDeliveries) {
    const work = await nextWork(db, preferRetry);
    if (!work) break;
    examined += 1;
    if (work.promoted) promoted += 1;
    const result = await dispatchWebhookDeliveryById(db, work.id, {
      ...(options.allowLocalHttp === undefined ? {} : { allowLocalHttp: options.allowLocalHttp }),
    });
    if (result.claimed) claimed += 1;
    if (result.finalized) finalized += 1;
    preferRetry = !preferRetry;
  }

  return { claimed, examined, finalized, promoted };
}
