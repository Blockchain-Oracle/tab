import { describe, expect, it } from "vitest";

import { currentPaymentIdempotencyKey, withPaymentIdempotencyKey } from "./payment-idempotency.js";

describe("payment idempotency context", () => {
  it("binds nested asynchronous work without leaking between calls", async () => {
    expect(currentPaymentIdempotencyKey()).toBeUndefined();
    await Promise.all([
      withPaymentIdempotencyKey("pay_first", async () => {
        await Promise.resolve();
        expect(currentPaymentIdempotencyKey()).toBe("pay_first");
      }),
      withPaymentIdempotencyKey("pay_second", async () => {
        await Promise.resolve();
        expect(currentPaymentIdempotencyKey()).toBe("pay_second");
      }),
    ]);
    expect(currentPaymentIdempotencyKey()).toBeUndefined();
  });
});
