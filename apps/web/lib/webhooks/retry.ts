const RETRY_DELAY_MS = [60_000, 4 * 60_000] as const;

export function nextWebhookRetryAt(attempt: number, completedAt: Date) {
  if (
    !Number.isInteger(attempt) ||
    attempt < 1 ||
    attempt > 3 ||
    !Number.isFinite(completedAt.getTime())
  ) {
    throw new Error("Invalid webhook attempt");
  }
  if (attempt === 3) return null;
  const delay = attempt === 1 ? RETRY_DELAY_MS[0] : RETRY_DELAY_MS[1];
  return new Date(completedAt.getTime() + delay);
}
