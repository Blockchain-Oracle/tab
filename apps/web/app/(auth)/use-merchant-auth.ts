"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useReducer, useRef, useState } from "react";

import { type EmailOtpFlow, getMagicClient } from "../../lib/auth/magic-client";
import { AuthRequestError, precheckEmail, verifyDidToken } from "./auth-api";
import { AuthAttemptGate } from "./auth-attempt";
import { type AuthFlow, authCopy } from "./auth-copy";
import { precheckFailure } from "./auth-errors";
import { authReducer, initialAuthState } from "./auth-state";
import { bindMagicFlowEvents } from "./magic-flow-events";

type MerchantAuthOptions = {
  configured: boolean;
  flow: AuthFlow;
  publishableKey: string;
};

export function useMerchantAuth({ configured, flow, publishableKey }: MerchantAuthOptions) {
  const router = useRouter();
  const [state, dispatch] = useReducer(authReducer, initialAuthState);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<{ code: string; message: string }>();
  const [flowError, setFlowError] = useState<string>(authCopy[flow].genericError);
  const [deviceMessage, setDeviceMessage] = useState(
    "Magic needs you to approve this device. Follow the instructions in your email.",
  );
  const [notice, setNotice] = useState<string>();
  const activeFlow = useRef<EmailOtpFlow | undefined>(undefined);
  const submittedOtp = useRef<{ flow: EmailOtpFlow; otp: string } | undefined>(undefined);
  const resendRequested = useRef(false);
  const attemptGate = useRef(new AuthAttemptGate());

  function cancelActiveFlow() {
    const challenge = activeFlow.current;
    activeFlow.current = undefined;
    submittedOtp.current = undefined;
    challenge?.emit("cancel");
  }

  useEffect(
    () => () => {
      const challenge = activeFlow.current;
      attemptGate.current.cancel();
      activeFlow.current = undefined;
      submittedOtp.current = undefined;
      challenge?.emit("cancel");
    },
    [],
  );

  function failFlow(challenge: EmailOtpFlow, message: string) {
    if (activeFlow.current !== challenge) return;
    activeFlow.current = undefined;
    submittedOtp.current = undefined;
    challenge.emit("cancel");
    setFlowError(message);
    dispatch({ type: "auth-failed" });
  }

  function startMagicChallenge(normalizedEmail: string) {
    let challenge: EmailOtpFlow;
    try {
      challenge = getMagicClient(publishableKey).auth.loginWithEmailOTP({
        deviceCheckUI: false,
        email: normalizedEmail,
        showUI: false,
      });
    } catch {
      setFlowError(authCopy[flow].genericError);
      dispatch({ type: "auth-failed" });
      return;
    }

    activeFlow.current = challenge;
    bindMagicFlowEvents(
      challenge,
      {
        deviceApproved: () => setDeviceMessage("Device approved. Waiting for your one-time code…"),
        deviceApprovalNeeded: () => dispatch({ type: "device-approval" }),
        deviceEmailSent: () => {
          setDeviceMessage(`Magic sent a device approval link to ${normalizedEmail}.`);
          dispatch({ type: "device-approval" });
        },
        deviceLinkExpired: () =>
          failFlow(challenge, "The device approval link expired. Try again."),
        otpExpired: () => {
          submittedOtp.current = undefined;
          dispatch({ type: "otp-expired" });
        },
        otpInvalid: () => {
          submittedOtp.current = undefined;
          dispatch({ type: "otp-invalid" });
        },
        otpSent: () => {
          setNotice(resendRequested.current ? "A new code was sent." : undefined);
          resendRequested.current = false;
          dispatch({ type: "otp-sent" });
        },
        rateLimited: () => dispatch({ type: "rate-limited" }),
        unsupported: () =>
          failFlow(
            challenge,
            "This account needs an authentication method Tab does not support yet.",
          ),
      },
      () => activeFlow.current === challenge,
    );

    void challenge
      .then(async (didToken) => {
        if (activeFlow.current !== challenge) return;
        if (!didToken) throw new Error("Magic did not return a DID token");
        const redirectTo = await verifyDidToken(didToken, flow);
        if (activeFlow.current !== challenge) return;

        activeFlow.current = undefined;
        dispatch({ type: "auth-succeeded" });
        router.replace(redirectTo);
        router.refresh();
      })
      .catch((error: unknown) => {
        if (activeFlow.current !== challenge) return;
        setFlowError(
          error instanceof AuthRequestError ? error.message : authCopy[flow].genericError,
        );
        activeFlow.current = undefined;
        dispatch({ type: "auth-failed" });
      });
  }

  async function beginChallenge(normalizedEmail: string, resend = false) {
    if (!configured) return;
    cancelActiveFlow();
    const attempt = attemptGate.current.begin();
    setEmailError(undefined);
    setNotice(undefined);
    resendRequested.current = resend;
    dispatch({ type: "email-submitted" });

    try {
      await precheckEmail(normalizedEmail, flow, { signal: attempt.signal });
      if (!attempt.isCurrent()) return;
      attempt.finish();
      startMagicChallenge(normalizedEmail);
    } catch (error) {
      if (!attempt.isCurrent()) return;
      attempt.finish();
      resendRequested.current = false;
      setEmailError(precheckFailure(error, flow));
      dispatch({ type: "return-to-email" });
    }
  }

  useEffect(() => {
    if (state.stage !== "otp" || state.otp.length !== 6) return;
    const challenge = activeFlow.current;
    if (!challenge) return;
    if (submittedOtp.current?.flow === challenge && submittedOtp.current.otp === state.otp) return;

    submittedOtp.current = { flow: challenge, otp: state.otp };
    dispatch({ type: "otp-submitted" });
    challenge.emit("verify-email-otp", state.otp);
  }, [state.otp, state.stage]);

  function returnToEmail() {
    attemptGate.current.cancel();
    cancelActiveFlow();
    setNotice(undefined);
    dispatch({ type: "return-to-email" });
  }

  return {
    changeEmail(value: string) {
      setEmail(value);
      setEmailError(undefined);
    },
    changeOtp(otp: string) {
      dispatch({ otp, type: "otp-changed" });
    },
    deviceMessage,
    email,
    emailError,
    flowError,
    notice,
    resendCode() {
      void beginChallenge(email, true);
    },
    returnToEmail,
    state,
    submitEmail(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      const normalizedEmail = email.trim().toLowerCase();
      setEmail(normalizedEmail);
      void beginChallenge(normalizedEmail);
    },
  };
}
