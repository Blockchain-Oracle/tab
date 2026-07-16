import { describe, expect, it } from "vitest";

import { checkoutReducer, initialCheckoutState } from "./checkout-state";

describe("checkout state machine", () => {
  it("moves through auth and insufficient funds without allowing fake success", () => {
    let state = checkoutReducer(initialCheckoutState, { type: "bootstrap-ready" });
    expect(state.stage).toBe("idle");

    state = checkoutReducer(state, { type: "pay-started" });
    state = checkoutReducer(state, { type: "auth-required" });
    state = checkoutReducer(state, { type: "email-submitted" });
    state = checkoutReducer(state, { type: "otp-sent" });
    state = checkoutReducer(state, { otp: "6a4 1728", type: "otp-changed" });
    expect(state).toMatchObject({ otp: "641728", stage: "otp" });

    state = checkoutReducer(state, { type: "otp-submitted" });
    state = checkoutReducer(state, { type: "auth-succeeded" });
    state = checkoutReducer(state, { sufficient: false, type: "balance-resolved" });
    state = checkoutReducer(state, { type: "add-funds-opened" });
    expect(state.stage).toBe("add-funds");

    state = checkoutReducer(state, { type: "cancelled" });
    expect(state).toEqual({ otp: "", stage: "idle" });
  });

  it("ignores impossible and stale transitions", () => {
    expect(checkoutReducer(initialCheckoutState, { type: "pay-started" })).toBe(
      initialCheckoutState,
    );

    const idle = checkoutReducer(initialCheckoutState, { type: "bootstrap-ready" });
    expect(checkoutReducer(idle, { type: "auth-succeeded" })).toBe(idle);
    expect(checkoutReducer(idle, { type: "payment-succeeded" })).toBe(idle);
  });

  it("supports real balance rechecks and recoverable OTP errors", () => {
    let state = checkoutReducer(initialCheckoutState, { type: "bootstrap-ready" });
    state = checkoutReducer(state, { type: "pay-started" });
    state = checkoutReducer(state, { type: "auth-required" });
    state = checkoutReducer(state, { type: "email-submitted" });
    state = checkoutReducer(state, { type: "otp-sent" });
    state = checkoutReducer(state, { otp: "641728", type: "otp-changed" });
    state = checkoutReducer(state, { type: "otp-submitted" });
    state = checkoutReducer(state, { type: "otp-rejected" });
    expect(state).toEqual({ otp: "", stage: "otp" });

    state = checkoutReducer(state, { otp: "641728", type: "otp-changed" });
    state = checkoutReducer(state, { type: "otp-submitted" });
    state = checkoutReducer(state, { type: "auth-succeeded" });
    state = checkoutReducer(state, { sufficient: false, type: "balance-resolved" });
    state = checkoutReducer(state, { type: "add-funds-opened" });
    state = checkoutReducer(state, { type: "balance-recheck-started" });
    expect(state.stage).toBe("balance-loading");
  });

  it("surfaces throttling that arrives while the email request is still sending", () => {
    let state = checkoutReducer(initialCheckoutState, { type: "bootstrap-ready" });
    state = checkoutReducer(state, { type: "pay-started" });
    state = checkoutReducer(state, { type: "auth-required" });
    state = checkoutReducer(state, { type: "email-submitted" });

    state = checkoutReducer(state, { type: "otp-rejected" });

    expect(state).toEqual({ otp: "", stage: "otp" });
    state = checkoutReducer(state, { type: "auth-restarted" });
    expect(state).toEqual({ otp: "", stage: "email" });
  });
});
