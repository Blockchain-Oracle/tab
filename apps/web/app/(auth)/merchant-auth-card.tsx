"use client";

import { AuthChallengePanel } from "./auth-challenge-panel";
import { type AuthFlow, authCopy } from "./auth-copy";
import { AuthEmailPanel } from "./auth-email-panel";
import { AuthStatusPanel } from "./auth-status-panel";
import { useMerchantAuth } from "./use-merchant-auth";

type MerchantAuthCardProps = {
  configured: boolean;
  configurationMessage: string;
  flow: AuthFlow;
  publishableKey: string;
};

export function MerchantAuthCard(props: MerchantAuthCardProps) {
  const auth = useMerchantAuth(props);
  const { state } = auth;

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
    const copy = authCopy[props.flow];
    return <AuthStatusPanel body={copy.redirectBody} kind="success" title={copy.redirectTitle} />;
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
    <AuthEmailPanel
      configured={props.configured}
      configurationMessage={props.configurationMessage}
      email={auth.email}
      errorCode={auth.emailError?.code}
      errorMessage={auth.emailError?.message}
      flow={props.flow}
      onEmailChange={auth.changeEmail}
      onSubmit={auth.submitEmail}
      sending={state.stage === "sending"}
    />
  );
}
