import { describe, expect, it } from "vitest";

import { nextWebhookRetryAt } from "./retry";

describe("webhook retry schedule", () => {
  it("honors the three-total-attempt cap", () => {
    const completedAt = new Date("2026-07-15T12:00:00.000Z");

    expect(nextWebhookRetryAt(1, completedAt)).toEqual(new Date("2026-07-15T12:01:00.000Z"));
    expect(nextWebhookRetryAt(2, completedAt)).toEqual(new Date("2026-07-15T12:04:00.000Z"));
    expect(nextWebhookRetryAt(3, completedAt)).toBeNull();
  });

  it("rejects attempts outside the persisted 1..3 range", () => {
    expect(() => nextWebhookRetryAt(0, new Date())).toThrow();
    expect(() => nextWebhookRetryAt(4, new Date())).toThrow();
  });
});
