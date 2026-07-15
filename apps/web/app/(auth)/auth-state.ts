export type AuthStage =
  | "email"
  | "sending"
  | "otp"
  | "verifying"
  | "wrong"
  | "expired"
  | "limited"
  | "device"
  | "success"
  | "error";

export type AuthState = {
  otp: string;
  stage: AuthStage;
};

export type AuthEvent =
  | { type: "email-submitted" }
  | { type: "otp-sent" }
  | { otp: string; type: "otp-changed" }
  | { type: "otp-submitted" }
  | { type: "otp-invalid" }
  | { type: "otp-expired" }
  | { type: "rate-limited" }
  | { type: "device-approval" }
  | { type: "auth-succeeded" }
  | { type: "auth-failed" }
  | { type: "return-to-email" };

export const initialAuthState: AuthState = { otp: "", stage: "email" };

export function authReducer(state: AuthState, event: AuthEvent): AuthState {
  switch (event.type) {
    case "email-submitted":
      return { otp: "", stage: "sending" };
    case "otp-sent":
      return state.stage === "sending" || state.stage === "device"
        ? { otp: "", stage: "otp" }
        : state;
    case "otp-changed":
      return {
        otp: event.otp.replace(/\D/g, "").slice(0, 6),
        stage: state.stage === "wrong" || state.stage === "expired" ? "otp" : state.stage,
      };
    case "otp-submitted":
      return state.stage === "otp" && state.otp.length === 6
        ? { ...state, stage: "verifying" }
        : state;
    case "otp-invalid":
      return state.stage === "verifying" ? { otp: "", stage: "wrong" } : state;
    case "otp-expired":
      return state.stage === "otp" || state.stage === "verifying"
        ? { otp: "", stage: "expired" }
        : state;
    case "rate-limited":
      return { otp: "", stage: "limited" };
    case "device-approval":
      return { otp: "", stage: "device" };
    case "auth-succeeded":
      return { ...state, stage: "success" };
    case "auth-failed":
      return { otp: "", stage: "error" };
    case "return-to-email":
      return initialAuthState;
  }
}
