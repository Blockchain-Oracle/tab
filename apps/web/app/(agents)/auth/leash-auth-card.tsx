"use client";

import { useMemo } from "react";

import { AuthChallengePanel } from "../../(auth)/auth-challenge-panel";
import { createEmailOtpAuthApi } from "../../(auth)/auth-request";
import { AuthResumePanel } from "../../(auth)/auth-resume-panel";
import { AuthStatusPanel } from "../../(auth)/auth-status-panel";
import { useSilentResume } from "../../(auth)/use-silent-resume";
import { LeashAuthEmailPanel } from "./leash-auth-email-panel";
import { useLeashAuth } from "./use-leash-auth";

type LeashAuthCardProps = {
  configured: boolean;
  configurationMessage: string;
  publishableKey: string;
};

export function LeashAuthCard(props: LeashAuthCardProps) {
  const auth = useLeashAuth(props);
  const { state } = auth;
  const resumeApi = useMemo(
    () =>
      createEmailOtpAuthApi({
        precheckPath: "/api/agents/auth/precheck",
        verifyPath: "/api/agents/auth/verify",
      }),
    [],
  );
  const resume = useSilentResume({
    enabled: props.configured,
    onKnownEmail: auth.changeEmail,
    publishableKey: props.publishableKey,
    verify: (didToken, email, options) => resumeApi.verifyDidToken(didToken, email, options),
  });

  if (resume.status === "resuming") {
    return <AuthResumePanel email={resume.email} onDismiss={resume.dismiss} />;
  }

  if (state.stage === "device") {
    return (
      <AuthStatusPanel
        body={auth.deviceMessage}
        kind="device"
        onBack={auth.returnToEmail}
        title="Approve this device"
      />
    );
  }

  if (state.stage === "success") {
    return (
      <AuthStatusPanel
        body="Taking you to your Agent dashboard…"
        kind="success"
        title="You’re in"
      />
    );
  }

  if (state.stage === "error") {
    return (
      <AuthStatusPanel
        body={auth.flowError}
        kind="error"
        onBack={auth.returnToEmail}
        title="We couldn’t finish"
      />
    );
  }

  if (["otp", "wrong", "expired", "limited", "verifying"].includes(state.stage)) {
    return (
      <AuthChallengePanel
        email={auth.email}
        notice={auth.notice}
        onBack={auth.returnToEmail}
        onChange={auth.changeOtp}
        onResend={auth.resendCode}
        state={state}
      />
    );
  }

  return (
    <LeashAuthEmailPanel
      configured={props.configured}
      configurationMessage={props.configurationMessage}
      email={auth.email}
      errorMessage={auth.emailError}
      onEmailChange={auth.changeEmail}
      onSubmit={auth.submitEmail}
      sending={state.stage === "sending"}
    />
  );
}
