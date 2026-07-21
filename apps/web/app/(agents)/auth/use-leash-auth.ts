"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useReducer, useRef, useState } from "react";

import { type EmailOtpFlow, getMagicClient } from "../../../lib/auth/magic-client";
import { AuthRequestError } from "../../(auth)/auth-api";
import { AuthAttemptGate } from "../../(auth)/auth-attempt";
import { authReducer, initialAuthState } from "../../(auth)/auth-state";
import {
  type MagicEmailOtpChallenge,
  startMagicEmailOtpChallenge,
} from "../../(auth)/magic-challenge";
import { precheckLeashEmail, verifyLeashDidToken } from "./leash-auth-api";
import { runLeashAuthEntry } from "./leash-auth-entry";

type LeashAuthOptions = {
  configured: boolean;
  publishableKey: string;
};

const genericError = "Couldn’t log you in to Leash. Try again.";

function failureMessage(error: unknown) {
  return error instanceof AuthRequestError ? error.message : genericError;
}

export function useLeashAuth({ configured, publishableKey }: LeashAuthOptions) {
  const router = useRouter();
  const [state, dispatch] = useReducer(authReducer, initialAuthState);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string>();
  const [flowError, setFlowError] = useState(genericError);
  const [deviceMessage, setDeviceMessage] = useState(
    "Magic needs you to approve this device. Follow the instructions in your email.",
  );
  const [notice, setNotice] = useState<string>();
  const activeChallenge = useRef<MagicEmailOtpChallenge | undefined>(undefined);
  const submittedOtp = useRef<{ flow: EmailOtpFlow; otp: string } | undefined>(undefined);
  const resendRequested = useRef(false);
  const attemptGate = useRef(new AuthAttemptGate());

  function cancelActiveFlow() {
    const active = activeChallenge.current;
    activeChallenge.current = undefined;
    submittedOtp.current = undefined;
    active?.cancel();
  }

  useEffect(
    () => () => {
      const active = activeChallenge.current;
      attemptGate.current.cancel();
      activeChallenge.current = undefined;
      submittedOtp.current = undefined;
      active?.cancel();
    },
    [],
  );

  function failFlow(challenge: EmailOtpFlow, message: string) {
    if (activeChallenge.current?.flow !== challenge) return;
    cancelActiveFlow();
    setFlowError(message);
    dispatch({ type: "auth-failed" });
  }

  function startMagicChallenge(normalizedEmail: string) {
    activeChallenge.current = startMagicEmailOtpChallenge({
      dispatch,
      email: normalizedEmail,
      isCurrent: (challenge) => activeChallenge.current?.flow === challenge,
      isResend: () => resendRequested.current,
      onAuthenticated(challenge, redirectTo) {
        if (activeChallenge.current?.flow !== challenge) return;
        activeChallenge.current = undefined;
        dispatch({ type: "auth-succeeded" });
        router.replace(redirectTo);
        router.refresh();
      },
      onFailure(challenge, error) {
        if (challenge && activeChallenge.current?.flow !== challenge) return;
        setFlowError(failureMessage(error));
        activeChallenge.current = undefined;
        submittedOtp.current = undefined;
        dispatch({ type: "auth-failed" });
      },
      onFatal: failFlow,
      publishableKey,
      resetResend: () => {
        resendRequested.current = false;
      },
      resetSubmittedOtp: () => {
        submittedOtp.current = undefined;
      },
      setDeviceMessage,
      setNotice,
      verifyDidToken: (didToken, signal) =>
        verifyLeashDidToken(didToken, normalizedEmail, { signal }),
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
      await runLeashAuthEntry({
        isCurrent: attempt.isCurrent,
        onAuthenticated(redirectTo) {
          attempt.finish();
          dispatch({ type: "auth-succeeded" });
          router.replace(redirectTo);
          router.refresh();
        },
        onChallenge() {
          attempt.finish();
          startMagicChallenge(normalizedEmail);
        },
        onPrecheckRejected(error) {
          attempt.finish();
          resendRequested.current = false;
          setEmailError(failureMessage(error));
          dispatch({ type: "return-to-email" });
        },
        precheck: () => precheckLeashEmail(normalizedEmail, { signal: attempt.signal }),
        user: getMagicClient(publishableKey).user,
        verifyDidToken: (didToken) =>
          verifyLeashDidToken(didToken, normalizedEmail, { signal: attempt.signal }),
      });
    } catch (error) {
      if (!attempt.isCurrent()) return;
      attempt.finish();
      setFlowError(failureMessage(error));
      dispatch({ type: "auth-failed" });
    }
  }

  useEffect(() => {
    if (state.stage !== "otp" || state.otp.length !== 6) return;
    const challenge = activeChallenge.current?.flow;
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
