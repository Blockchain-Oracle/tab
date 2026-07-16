export type CheckoutStage =
  | "intent-loading"
  | "idle"
  | "opening"
  | "email"
  | "email-sending"
  | "otp"
  | "otp-verifying"
  | "balance-loading"
  | "balance-ready"
  | "insufficient"
  | "add-funds"
  | "confirming"
  | "success"
  | "error";

export type CheckoutState = { otp: string; stage: CheckoutStage };

export type CheckoutEvent =
  | { type: "bootstrap-started" }
  | { type: "bootstrap-ready" }
  | { type: "pay-started" }
  | { type: "auth-required" }
  | { type: "email-submitted" }
  | { type: "otp-sent" }
  | { otp: string; type: "otp-changed" }
  | { type: "otp-submitted" }
  | { type: "otp-rejected" }
  | { type: "auth-restarted" }
  | { type: "auth-succeeded" }
  | { sufficient: boolean; type: "balance-resolved" }
  | { type: "add-funds-opened" }
  | { type: "balance-recheck-started" }
  | { type: "confirmation-started" }
  | { type: "payment-succeeded" }
  | { type: "failed" }
  | { type: "cancelled" };

export const initialCheckoutState: CheckoutState = { otp: "", stage: "intent-loading" };

function next(state: CheckoutState, stage: CheckoutStage): CheckoutState {
  return { otp: stage === "otp" || stage === "otp-verifying" ? state.otp : "", stage };
}

export function checkoutReducer(state: CheckoutState, event: CheckoutEvent): CheckoutState {
  switch (event.type) {
    case "bootstrap-started":
      return state.stage === "error" ? next(state, "intent-loading") : state;
    case "bootstrap-ready":
      return state.stage === "intent-loading" ? next(state, "idle") : state;
    case "pay-started":
      return state.stage === "idle" || state.stage === "error" ? next(state, "opening") : state;
    case "auth-required":
      return state.stage === "opening" ? next(state, "email") : state;
    case "email-submitted":
      return state.stage === "email" ? next(state, "email-sending") : state;
    case "otp-sent":
      return state.stage === "email-sending" ? next(state, "otp") : state;
    case "otp-changed":
      return state.stage === "otp"
        ? { otp: event.otp.replace(/\D/g, "").slice(0, 6), stage: "otp" }
        : state;
    case "otp-submitted":
      return state.stage === "otp" && state.otp.length === 6 ? next(state, "otp-verifying") : state;
    case "otp-rejected":
      return state.stage === "email-sending" || state.stage === "otp-verifying"
        ? { otp: "", stage: "otp" }
        : state;
    case "auth-restarted":
      return state.stage === "otp" ? next(state, "email") : state;
    case "auth-succeeded":
      return state.stage === "opening" || state.stage === "otp-verifying"
        ? next(state, "balance-loading")
        : state;
    case "balance-resolved":
      return state.stage === "balance-loading"
        ? next(state, event.sufficient ? "balance-ready" : "insufficient")
        : state;
    case "add-funds-opened":
      return state.stage === "insufficient" ? next(state, "add-funds") : state;
    case "balance-recheck-started":
      return state.stage === "add-funds" || state.stage === "insufficient"
        ? next(state, "balance-loading")
        : state;
    case "confirmation-started":
      return state.stage === "balance-ready" ? next(state, "confirming") : state;
    case "payment-succeeded":
      return state.stage === "confirming" ? next(state, "success") : state;
    case "failed":
      return state.stage === "success" ? state : next(state, "error");
    case "cancelled":
      return state.stage === "confirming" ? state : { otp: "", stage: "idle" };
  }
}
