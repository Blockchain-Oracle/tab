import { type EmailOtpFlow, getMagicClient } from "../../lib/auth/magic-client";
import type { AuthEvent } from "./auth-state";
import { bindMagicFlowEvents } from "./magic-flow-events";

type MagicChallengeOptions = {
  dispatch: (event: AuthEvent) => void;
  email: string;
  isCurrent: (challenge: EmailOtpFlow) => boolean;
  isResend: () => boolean;
  onAuthenticated: (challenge: EmailOtpFlow, redirectTo: string) => void;
  onFailure: (challenge: EmailOtpFlow | undefined, error: unknown) => void;
  onFatal: (challenge: EmailOtpFlow, message: string) => void;
  publishableKey: string;
  resetResend: () => void;
  resetSubmittedOtp: () => void;
  setDeviceMessage: (message: string) => void;
  setNotice: (message: string | undefined) => void;
  verifyDidToken: (didToken: string, signal: AbortSignal) => Promise<string>;
};

export type MagicEmailOtpChallenge = {
  cancel: () => void;
  flow: EmailOtpFlow;
};

export function startMagicEmailOtpChallenge(options: MagicChallengeOptions) {
  let challenge: EmailOtpFlow;
  try {
    challenge = getMagicClient(options.publishableKey).auth.loginWithEmailOTP({
      deviceCheckUI: false,
      email: options.email,
      showUI: false,
    });
  } catch (error) {
    options.onFailure(undefined, error);
    return;
  }

  const verification = new AbortController();
  let cancelled = false;
  const isCurrent = () => !cancelled && options.isCurrent(challenge);
  bindMagicFlowEvents(
    challenge,
    {
      deviceApproved: () =>
        options.setDeviceMessage("Device approved. Waiting for your one-time code…"),
      deviceApprovalNeeded: () => options.dispatch({ type: "device-approval" }),
      deviceEmailSent: () => {
        options.setDeviceMessage(`Magic sent a device approval link to ${options.email}.`);
        options.dispatch({ type: "device-approval" });
      },
      deviceLinkExpired: () =>
        options.onFatal(challenge, "The device approval link expired. Try again."),
      otpExpired: () => {
        options.resetSubmittedOtp();
        options.dispatch({ type: "otp-expired" });
      },
      otpInvalid: () => {
        options.resetSubmittedOtp();
        options.dispatch({ type: "otp-invalid" });
      },
      otpSent: () => {
        options.setNotice(options.isResend() ? "A new code was sent." : undefined);
        options.resetResend();
        options.dispatch({ type: "otp-sent" });
      },
      rateLimited: () => options.dispatch({ type: "rate-limited" }),
      unsupported: () =>
        options.onFatal(
          challenge,
          "This account needs an authentication method Tab does not support yet.",
        ),
    },
    isCurrent,
  );

  void challenge
    .then(async (didToken) => {
      if (!isCurrent()) return;
      if (!didToken) throw new Error("Magic did not return a DID token");
      const redirectTo = await options.verifyDidToken(didToken, verification.signal);
      if (isCurrent()) options.onAuthenticated(challenge, redirectTo);
    })
    .catch((error: unknown) => {
      if (isCurrent()) options.onFailure(challenge, error);
    });

  return {
    cancel() {
      if (cancelled) return;
      cancelled = true;
      verification.abort();
      challenge.emit("cancel");
    },
    flow: challenge,
  } satisfies MagicEmailOtpChallenge;
}
