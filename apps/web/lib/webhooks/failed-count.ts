import { and, count, eq, inArray } from "drizzle-orm";

import type { Database } from "../db/client";
import { webhookDeliveries } from "../db/schema";

/**
 * Deliveries that ended badly for a merchant in the given env — the number
 * behind the Webhooks nav alert. Transient `retrying` is excluded: the alert
 * means "someone must look", not "the worker is busy".
 */
export async function countFailedWebhookDeliveries(
  db: Database,
  merchantId: string,
  env: "live" | "test",
) {
  const [row] = await db
    .select({ value: count() })
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.merchantId, merchantId),
        eq(webhookDeliveries.env, env),
        inArray(webhookDeliveries.result, ["failed", "gave_up", "timeout"]),
      ),
    );
  return row?.value ?? 0;
}
