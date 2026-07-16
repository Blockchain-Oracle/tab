import { and, count, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import type { ApiEnvironment } from "../auth/api-key";
import type { Database } from "../db/client";
import { webhookDeliveries } from "../db/schema";

type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type WebhookRootTrigger = "auto" | "manual";

export const WEBHOOK_ROOT_RATE_LIMIT = 10;
export const WEBHOOK_ROOT_CONCURRENCY_LIMIT = 2;
export const WEBHOOK_ROOT_RATE_WINDOW_MS = 10 * 60 * 1000;

export async function webhookRootAdmissionAllowed(
  transaction: DatabaseTransaction,
  principal: { env: ApiEnvironment; merchantId: string },
  trigger: WebhookRootTrigger,
) {
  if (principal.env === "live" && trigger === "auto") return true;

  const lockKey = `webhook-egress:${principal.merchantId}:${principal.env}`;
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
  const triggerScope =
    principal.env === "test" ? undefined : eq(webhookDeliveries.trigger, "manual");

  const [recent] = await transaction
    .select({ value: count() })
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.merchantId, principal.merchantId),
        eq(webhookDeliveries.env, principal.env),
        triggerScope,
        eq(webhookDeliveries.attempt, 1),
        gte(
          webhookDeliveries.createdAt,
          sql`clock_timestamp() - (${WEBHOOK_ROOT_RATE_WINDOW_MS} * interval '1 millisecond')`,
        ),
      ),
    );
  if ((recent?.value ?? 0) >= WEBHOOK_ROOT_RATE_LIMIT) return false;

  const [active] = await transaction
    .select({ value: count() })
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.merchantId, principal.merchantId),
        eq(webhookDeliveries.env, principal.env),
        triggerScope,
        inArray(webhookDeliveries.result, ["pending", "retrying"]),
        isNull(webhookDeliveries.supersededById),
      ),
    );
  return (active?.value ?? 0) < WEBHOOK_ROOT_CONCURRENCY_LIMIT;
}
