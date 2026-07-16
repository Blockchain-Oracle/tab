import { useRef } from "react";

import { CheckoutShell } from "./CheckoutShell";
import type { CheckoutServices } from "./checkout-services";
import { defaultCheckoutServices } from "./checkout-services";
import { BUYER_COPY } from "./copy";
import { AddFundsState } from "./states/AddFundsState";
import { AuthState } from "./states/AuthState";
import { BalanceState } from "./states/BalanceState";
import { ErrorState } from "./states/ErrorState";
import { IdleState } from "./states/IdleState";
import { InsufficientState } from "./states/InsufficientState";
import { LoadingState } from "./states/LoadingState";
import { SuccessState } from "./states/SuccessState";
import { formatAmount, useCheckoutController } from "./use-checkout-controller";

export type PayButtonProps = {
  apiBaseUrl: string;
  intentUrl: string;
  onSuccess: (transactionId: string, tokenChanges: object) => void;
  publishableKey: string;
};

type PayButtonCoreProps = PayButtonProps & { services: CheckoutServices };

export function PayButtonCore(props: PayButtonCoreProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const controller = useCheckoutController({
    apiBaseUrl: props.apiBaseUrl,
    intentUrl: props.intentUrl,
    onSuccess: props.onSuccess,
    publishableKey: props.publishableKey,
    services: props.services,
  });
  const { account, context, error, intentResponse, opened } = controller.model;
  const { stage } = controller.state;
  const intent = intentResponse?.intent;
  const amount = intent ? formatAmount(intent.amount) : undefined;
  const trigger = (
    <IdleState
      amount={amount}
      buttonRef={triggerRef}
      disabled={stage !== "idle" || !intent || !context}
      onClick={() => void controller.start()}
    />
  );

  if (stage === "intent-loading" || stage === "idle") {
    return trigger;
  }

  if (!intent || !context) {
    return (
      <>
        {trigger}
        {error ? (
          <div role="alert" style={{ marginTop: 12 }}>
            <ErrorState
              body={error.body}
              onRetry={error.retryable ? controller.retry : undefined}
              title={error.title}
            />
          </div>
        ) : null}
      </>
    );
  }

  const merchantName = context.merchant.businessName?.trim() || BUYER_COPY.merchant;
  const balance = formatAmount(account?.balanceUsd ?? 0);
  let body = <LoadingState />;
  if (
    stage === "email" ||
    stage === "email-sending" ||
    stage === "otp" ||
    stage === "otp-verifying"
  ) {
    body = (
      <AuthState
        cooldownActive={controller.authCooldownActive}
        email={controller.model.email}
        issue={controller.model.otpIssue}
        onEmailChange={controller.setEmail}
        onEmailSubmit={() => void controller.submitEmail()}
        onOtpChange={(otp) => controller.dispatch({ otp, type: "otp-changed" })}
        onOtpComplete={controller.submitOtp}
        onStartOver={controller.restartAuth}
        otp={controller.state.otp}
        stage={stage}
      />
    );
  } else if (stage === "balance-loading") {
    body = <LoadingState label={BUYER_COPY.checkingBalance} />;
  } else if (stage === "balance-ready" && account && amount) {
    body = (
      <BalanceState
        amount={amount}
        balance={balance}
        merchantName={merchantName}
        onConfirm={() => void controller.confirm()}
      />
    );
  } else if (stage === "insufficient" && account) {
    const shortfall = formatAmount(Math.max(0, Number(intent.amount) - account.balanceUsd));
    body = (
      <InsufficientState
        balance={balance}
        onAddFunds={() => controller.dispatch({ type: "add-funds-opened" })}
        onCancel={controller.cancel}
        shortfall={shortfall}
      />
    );
  } else if (stage === "add-funds" && account) {
    body = (
      <AddFundsState
        address={account.depositAddress}
        onCancel={controller.cancel}
        onRecheck={() => void controller.recheck()}
      />
    );
  } else if (stage === "confirming") {
    body = <LoadingState label={BUYER_COPY.processing} />;
  } else if (stage === "success" && opened && amount) {
    body = <SuccessState amount={amount} onDone={controller.cancel} refCode={opened.refCode} />;
  } else if (stage === "error" && error) {
    body = (
      <ErrorState
        body={error.body}
        onCancel={controller.cancel}
        onRetry={error.retryable ? controller.retry : undefined}
        title={error.title}
      />
    );
  }

  return (
    <>
      {trigger}
      <CheckoutShell
        amount={formatAmount(intent.amount)}
        context={context}
        onCancel={controller.cancel}
        returnFocusRef={triggerRef}
        stage={stage}
      >
        {body}
      </CheckoutShell>
    </>
  );
}

export function PayButton(props: PayButtonProps) {
  return <PayButtonCore {...props} services={defaultCheckoutServices} />;
}
