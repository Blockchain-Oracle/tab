import { pgEnum } from "drizzle-orm/pg-core";

export const webhookDeliveryType = pgEnum("webhook_delivery_type", ["payment", "test"]);
export const webhookDeliveryTrigger = pgEnum("webhook_delivery_trigger", ["auto", "manual"]);
export const webhookDeliveryResult = pgEnum("webhook_delivery_result", [
  "pending",
  "delivered",
  "retrying",
  "failed",
  "timeout",
  "gave_up",
]);
export const webhookFailureKind = pgEnum("webhook_failure_kind", [
  "http",
  "network",
  "timeout",
  "configuration",
]);
