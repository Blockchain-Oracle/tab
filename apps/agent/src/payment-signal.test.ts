import { describe, expect, it } from "vitest";

import { currentPaymentSignal, withPaymentSignal } from "./payment-signal.js";

describe("payment cancellation context", () => {
  it("binds the exact request signal to asynchronous signing work", async () => {
    const controller = new AbortController();
    await withPaymentSignal(controller.signal, async () => {
      await Promise.resolve();
      expect(currentPaymentSignal()).toBe(controller.signal);
    });
    expect(currentPaymentSignal()).toBeUndefined();
  });
});
