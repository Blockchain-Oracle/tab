import type { EmailOtpFlow } from "../../lib/auth/magic-client";

type MagicFlowCallbacks = {
  deviceApproved: () => void;
  deviceApprovalNeeded: () => void;
  deviceEmailSent: () => void;
  deviceLinkExpired: () => void;
  otpExpired: () => void;
  otpInvalid: () => void;
  otpSent: () => void;
  rateLimited: () => void;
  unsupported: () => void;
};

export function bindMagicFlowEvents(
  challenge: EmailOtpFlow,
  callbacks: MagicFlowCallbacks,
  isCurrent: () => boolean,
) {
  const guarded = (callback: () => void) => () => {
    if (isCurrent()) callback();
  };

  challenge.on("email-otp-sent", guarded(callbacks.otpSent));
  challenge.on("invalid-email-otp", guarded(callbacks.otpInvalid));
  challenge.on("expired-email-otp", guarded(callbacks.otpExpired));
  challenge.on("login-throttled", guarded(callbacks.rateLimited));
  challenge.on("max-attempts-reached", guarded(callbacks.rateLimited));
  challenge.on("device-needs-approval", guarded(callbacks.deviceApprovalNeeded));
  challenge.on("device-verification-email-sent", guarded(callbacks.deviceEmailSent));
  challenge.on("device-approved", guarded(callbacks.deviceApproved));
  challenge.on("device-verification-link-expired", guarded(callbacks.deviceLinkExpired));
  challenge.on("mfa-sent-handle", guarded(callbacks.unsupported));
  challenge.on("invalid-mfa-otp", guarded(callbacks.unsupported));
  challenge.on("recovery-code-sent-handle", guarded(callbacks.unsupported));
  challenge.on("invalid-recovery-code", guarded(callbacks.unsupported));
  challenge.on("recovery-code-success", guarded(callbacks.unsupported));
}
