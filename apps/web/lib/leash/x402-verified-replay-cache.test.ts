import { describe, expect, it } from "vitest";

import { VerifiedReplayCache } from "./x402-verified-replay-cache";

const first = { paymentFingerprint: "11".repeat(32), value: "first" };
const second = { paymentFingerprint: "22".repeat(32), value: "second" };

describe("verified x402 replay cache", () => {
  it("evicts to its bound, expires entries, and consumes a match only once", () => {
    let now = 1_000;
    const cache = new VerifiedReplayCache<typeof first>({
      capacity: 1,
      now: () => now,
      ttlMs: 10,
    });

    cache.set("first", first);
    cache.set("second", second);
    expect(cache.take("first", first.paymentFingerprint)).toBeNull();
    expect(cache.take("second", second.paymentFingerprint)).toEqual(second);
    expect(cache.take("second", second.paymentFingerprint)).toBeNull();

    cache.set("first", first);
    now += 10;
    expect(cache.take("first", first.paymentFingerprint)).toBeNull();
  });

  it("consumes and rejects a fingerprint mismatch", () => {
    const cache = new VerifiedReplayCache<typeof first>();
    cache.set("first", first);
    expect(cache.take("first", second.paymentFingerprint)).toBeNull();
    expect(cache.take("first", first.paymentFingerprint)).toBeNull();
  });
});
