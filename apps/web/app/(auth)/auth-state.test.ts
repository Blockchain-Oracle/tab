import { describe, expect, it } from "vitest";

import { authReducer, initialAuthState } from "./auth-state";

describe("merchant auth state machine", () => {
  it("moves from email submission to a real OTP challenge", () => {
    const sending = authReducer(initialAuthState, { type: "email-submitted" });
    const awaiting = authReducer(sending, { type: "otp-sent" });

    expect(sending).toEqual({ otp: "", stage: "sending" });
    expect(awaiting).toEqual({ otp: "", stage: "otp" });
  });

  it("keeps only six numeric OTP digits", () => {
    const state = authReducer({ otp: "", stage: "otp" }, { otp: "7a31 6048", type: "otp-changed" });

    expect(state).toEqual({ otp: "731604", stage: "otp" });
  });

  it("clears rejected and expired codes for a fresh entry", () => {
    const verifying = { otp: "731604", stage: "verifying" } as const;

    expect(authReducer(verifying, { type: "otp-invalid" })).toEqual({
      otp: "",
      stage: "wrong",
    });
    expect(authReducer(verifying, { type: "otp-expired" })).toEqual({
      otp: "",
      stage: "expired",
    });
  });

  it("only enters verification when all six digits exist", () => {
    const incomplete = { otp: "73160", stage: "otp" } as const;
    const complete = { otp: "731604", stage: "otp" } as const;

    expect(authReducer(incomplete, { type: "otp-submitted" })).toBe(incomplete);
    expect(authReducer(complete, { type: "otp-submitted" })).toEqual({
      otp: "731604",
      stage: "verifying",
    });
  });

  it("ignores duplicate submits and events from a cancelled challenge", () => {
    const verifying = { otp: "731604", stage: "verifying" } as const;

    expect(authReducer(verifying, { type: "otp-submitted" })).toBe(verifying);
    expect(authReducer(initialAuthState, { type: "otp-sent" })).toBe(initialAuthState);
    expect(authReducer(initialAuthState, { type: "otp-invalid" })).toBe(initialAuthState);
  });

  it("does not confuse device approval with completed authentication", () => {
    const sending = { otp: "", stage: "sending" } as const;
    const device = authReducer(sending, { type: "device-approval" });

    expect(device).toEqual({ otp: "", stage: "device" });
    expect(authReducer(device, { type: "return-to-email" })).toEqual(initialAuthState);
  });

  it("locks the challenge after a real throttle event", () => {
    expect(authReducer({ otp: "731604", stage: "verifying" }, { type: "rate-limited" })).toEqual({
      otp: "",
      stage: "limited",
    });
  });
});
