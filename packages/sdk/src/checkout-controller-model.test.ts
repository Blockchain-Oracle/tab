import { describe, expect, it } from "vitest";

import { checkoutErrorView } from "./checkout-controller-model";
import { InvalidPaymentExecutionError } from "./execute";

describe("checkout error classification", () => {
  it("fails closed for a pre-broadcast JSON-RPC integration error", () => {
    const error = new InvalidPaymentExecutionError("invalid parameters", "prepare", {
      code: -32602,
      data: { privateMarker: "must-not-reach-copy" },
    });

    const view = checkoutErrorView(error, true);

    expect(view.retryable).toBe(false);
    expect(`${view.title} ${view.body}`).toContain("not been charged");
    expect(`${view.title} ${view.body}`).not.toContain("must-not-reach-copy");
  });

  it("keeps unknown pre-broadcast provider failures retryable", () => {
    const error = new InvalidPaymentExecutionError("internal error", "prepare", {
      code: -32603,
      data: { reason: "opaque" },
    });

    expect(checkoutErrorView(error, true).retryable).toBe(true);
  });

  it("never retries or promises no charge after broadcast starts", () => {
    const error = new InvalidPaymentExecutionError("lost result", "broadcast", {
      code: -32602,
      data: { reason: "opaque" },
    });

    const view = checkoutErrorView(error, true);

    expect(view.retryable).toBe(false);
    expect(view.title).toBe("Payment status unavailable");
    expect(view.body).not.toContain("not been charged");
  });
});
