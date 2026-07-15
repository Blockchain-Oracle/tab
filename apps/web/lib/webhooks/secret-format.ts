export const WEBHOOK_SECRET_PATTERN = /^whsec_[A-Za-z0-9_-]{43}$/;

export function isWebhookSecret(value: string) {
  return WEBHOOK_SECRET_PATTERN.test(value);
}
