import { createHmac, timingSafeEqual } from "node:crypto";

import { isWebhookSecret } from "./secret-format";

export const WEBHOOK_SIGNATURE_MAX_AGE_SECONDS = 5 * 60;
export const WEBHOOK_SIGNATURE_MAX_FUTURE_SKEW_SECONDS = 30;

const SIGNATURE_PATTERN = /^t=([0-9]+),v1=([0-9a-f]{64})$/;
type RawWebhookBody = string | Uint8Array;

function webhookDigest(rawBody: RawWebhookBody, secret: string, timestamp: number) {
  return createHmac("sha256", secret).update(`${timestamp}.`, "utf8").update(rawBody).digest();
}

export function signWebhookPayload(rawBody: string, secret: string, timestamp: number) {
  if (!isWebhookSecret(secret) || !Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new Error("Invalid webhook signature input");
  }
  const digest = webhookDigest(rawBody, secret, timestamp).toString("hex");
  return `t=${timestamp},v1=${digest}`;
}

export function verifyWebhookSignature(
  rawBody: RawWebhookBody,
  signatureHeader: string,
  secret: string,
  options: { nowSeconds?: number } = {},
) {
  const match = SIGNATURE_PATTERN.exec(signatureHeader);
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1_000);
  const timestamp = Number(match?.[1]);
  if (
    !match ||
    !isWebhookSecret(secret) ||
    !Number.isSafeInteger(nowSeconds) ||
    !Number.isSafeInteger(timestamp) ||
    timestamp < nowSeconds - WEBHOOK_SIGNATURE_MAX_AGE_SECONDS ||
    timestamp > nowSeconds + WEBHOOK_SIGNATURE_MAX_FUTURE_SKEW_SECONDS
  ) {
    return false;
  }
  const supplied = Buffer.from(match[2] ?? "", "hex");
  const expected = webhookDigest(rawBody, secret, timestamp);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
