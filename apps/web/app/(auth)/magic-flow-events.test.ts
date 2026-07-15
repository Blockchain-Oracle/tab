import { describe, expect, it, vi } from "vitest";

import type { EmailOtpFlow } from "../../lib/auth/magic-client";
import { bindMagicFlowEvents } from "./magic-flow-events";

function recordingFlow() {
  const listeners = new Map<string, () => void>();
  const flow = {
    on(event: string, listener: () => void) {
      listeners.set(event, listener);
      return flow;
    },
  } as unknown as EmailOtpFlow;

  return {
    emit(event: string) {
      listeners.get(event)?.();
    },
    flow,
  };
}

function callbacks() {
  return {
    deviceApproved: vi.fn(),
    deviceApprovalNeeded: vi.fn(),
    deviceEmailSent: vi.fn(),
    deviceLinkExpired: vi.fn(),
    otpExpired: vi.fn(),
    otpInvalid: vi.fn(),
    otpSent: vi.fn(),
    rateLimited: vi.fn(),
    unsupported: vi.fn(),
  };
}

describe("installed Magic OTP event contract", () => {
  it("maps provider events to honest UI transitions", () => {
    const source = recordingFlow();
    const handlers = callbacks();
    bindMagicFlowEvents(source.flow, handlers, () => true);

    source.emit("email-otp-sent");
    source.emit("invalid-email-otp");
    source.emit("expired-email-otp");
    source.emit("login-throttled");
    source.emit("max-attempts-reached");
    source.emit("device-needs-approval");
    source.emit("device-verification-email-sent");
    source.emit("device-approved");
    source.emit("device-verification-link-expired");
    source.emit("mfa-sent-handle");
    source.emit("recovery-code-success");

    expect(handlers.otpSent).toHaveBeenCalledOnce();
    expect(handlers.otpInvalid).toHaveBeenCalledOnce();
    expect(handlers.otpExpired).toHaveBeenCalledOnce();
    expect(handlers.rateLimited).toHaveBeenCalledTimes(2);
    expect(handlers.deviceApprovalNeeded).toHaveBeenCalledOnce();
    expect(handlers.deviceEmailSent).toHaveBeenCalledOnce();
    expect(handlers.deviceApproved).toHaveBeenCalledOnce();
    expect(handlers.deviceLinkExpired).toHaveBeenCalledOnce();
    expect(handlers.unsupported).toHaveBeenCalledTimes(2);
  });

  it("drops every event from a cancelled or replaced challenge", () => {
    const source = recordingFlow();
    const handlers = callbacks();
    bindMagicFlowEvents(source.flow, handlers, () => false);

    source.emit("email-otp-sent");
    source.emit("invalid-email-otp");
    source.emit("device-approved");

    expect(Object.values(handlers).every((handler) => handler.mock.calls.length === 0)).toBe(true);
  });
});
