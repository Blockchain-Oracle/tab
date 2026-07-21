import type { AuthFlow } from "./auth-copy";
import { type AuthRequestOptions, createEmailOtpAuthApi } from "./auth-request";

export { AuthRequestError } from "./auth-request";

function merchantAuthApi(flow: AuthFlow) {
  return createEmailOtpAuthApi({
    extraBody: { flow },
    precheckPath: "/api/auth/precheck",
    verifyPath: "/api/auth/verify",
  });
}

export function precheckEmail(email: string, flow: AuthFlow, options: AuthRequestOptions = {}) {
  return merchantAuthApi(flow).precheck(email, options);
}

export function verifyDidToken(
  didToken: string,
  email: string,
  flow: AuthFlow,
  options: AuthRequestOptions = {},
) {
  return merchantAuthApi(flow).verifyDidToken(didToken, email, options);
}
