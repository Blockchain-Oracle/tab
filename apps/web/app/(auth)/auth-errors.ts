import { AuthRequestError } from "./auth-api";
import { type AuthFlow, authCopy } from "./auth-copy";

export function precheckFailure(error: unknown, flow: AuthFlow) {
  if (error instanceof AuthRequestError) {
    if (error.code === "EMAIL_ALREADY_REGISTERED") {
      return { code: error.code, message: "An account with this email already exists." };
    }
    if (error.code === "EMAIL_NOT_REGISTERED") {
      return { code: error.code, message: "No account for this email." };
    }
    if (error.code === "INVALID_EMAIL") {
      return { code: error.code, message: error.message };
    }
  }

  return { code: "AUTH_REQUEST_FAILED", message: authCopy[flow].genericError };
}
