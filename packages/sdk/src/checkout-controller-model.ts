import type { Dispatch, MutableRefObject } from "react";

import type { CheckoutContext, MerchantIntentResponse, OpenedPayment } from "./checkout-api";
import type {
  AccountRuntime,
  BuyerAuthAttempt,
  BuyerRuntime,
  CheckoutServices,
} from "./checkout-services";
import type { CheckoutEvent } from "./checkout-state";
import { type BuyerFailure, buyerErrorCopy } from "./copy";
import { InvalidPaymentExecutionError, PaymentExecutionBlockedError } from "./execute";
import type { OtpIssue } from "./states/AuthState";

export type ErrorView = ReturnType<typeof buyerErrorCopy> & { retryable: boolean };
export type CheckoutModel = {
  account: AccountRuntime | undefined;
  buyer: BuyerRuntime | undefined;
  context: CheckoutContext | undefined;
  email: string;
  error: ErrorView | undefined;
  intentResponse: MerchantIntentResponse | undefined;
  opened: OpenedPayment | undefined;
  otpIssue: OtpIssue;
};

export type ControllerOptions = {
  apiBaseUrl: string;
  intentUrl: string;
  onSuccess: (transactionId: string, tokenChanges: object) => void;
  publishableKey: string;
  services: CheckoutServices;
};

export type ControllerRuntime = {
  authAttempt: MutableRefObject<BuyerAuthAttempt | undefined>;
  busy: MutableRefObject<boolean>;
  run: MutableRefObject<number>;
};

export type PatchModel = (value: Partial<CheckoutModel>) => void;
export type CheckoutDispatch = Dispatch<CheckoutEvent>;

export const initialModel: CheckoutModel = {
  account: undefined,
  buyer: undefined,
  context: undefined,
  email: "",
  error: undefined,
  intentResponse: undefined,
  opened: undefined,
  otpIssue: undefined,
};

const NON_RETRYABLE_JSON_RPC_CODES = new Set([-32700, -32600, -32601, -32602]);

function providerIntegrationFailure(error: unknown) {
  return (
    error instanceof InvalidPaymentExecutionError &&
    !error.broadcastStarted &&
    error.providerCode !== undefined &&
    NON_RETRYABLE_JSON_RPC_CODES.has(error.providerCode)
  );
}

export function buyerFailure(error: unknown, confirming = false): BuyerFailure {
  if (error instanceof PaymentExecutionBlockedError) {
    return { broadcastStarted: false, kind: "execution-blocked" };
  }
  if (error instanceof InvalidPaymentExecutionError) {
    if (providerIntegrationFailure(error)) {
      return { broadcastStarted: false, kind: "payment-unavailable" };
    }
    return { broadcastStarted: error.broadcastStarted, kind: "payment-failed" };
  }
  return confirming
    ? { broadcastStarted: true, kind: "payment-failed" }
    : { broadcastStarted: false, kind: "network-failed" };
}

export function checkoutErrorView(error: unknown, confirming = false): ErrorView {
  const detail = buyerFailure(error, confirming);
  return {
    ...buyerErrorCopy(detail),
    retryable: !detail.broadcastStarted && !providerIntegrationFailure(error),
  };
}

export function formatAmount(value: string | number) {
  if (typeof value === "number") return value.toFixed(2);
  const [whole = "0", fraction = ""] = value.split(".");
  const precise = fraction.padEnd(2, "0").replace(/0+$/, "").padEnd(2, "0");
  return `${whole}.${precise}`;
}
