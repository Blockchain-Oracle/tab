import { createHmac } from "node:crypto";

import { isWebhookSecret } from "./secret-format";

export function signWebhookPayload(rawBody: string, secret: string, timestamp: number) {
  if (!isWebhookSecret(secret) || !Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new Error("Invalid webhook signature input");
  }
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  return `t=${timestamp},v1=${digest}`;
}
