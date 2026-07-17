import { AuthRequestError } from "../../(auth)/auth-api";

type AuthRequester = (input: string, init: RequestInit) => Promise<Response>;

type AuthRequestOptions = {
  request?: AuthRequester;
  signal?: AbortSignal;
};

type ErrorBody = {
  error?: { code?: unknown; message?: unknown };
};

const browserRequest: AuthRequester = (input, init) => fetch(input, init);

async function postJson(path: string, body: Record<string, string>, options: AuthRequestOptions) {
  const init: RequestInit = {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  };
  if (options.signal) init.signal = options.signal;

  let response: Response;
  try {
    response = await (options.request ?? browserRequest)(path, init);
  } catch (error) {
    throw new AuthRequestError(
      "NETWORK_ERROR",
      "Tab could not reach the authentication service.",
      0,
      { cause: error },
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AuthRequestError(
      "INVALID_AUTH_RESPONSE",
      "Tab received an invalid authentication response.",
      response.status,
    );
  }

  if (!response.ok) {
    const apiError = (payload as ErrorBody).error;
    throw new AuthRequestError(
      typeof apiError?.code === "string" ? apiError.code : "AUTH_REQUEST_FAILED",
      typeof apiError?.message === "string"
        ? apiError.message
        : "Authentication could not be completed.",
      response.status,
    );
  }

  return payload;
}

export async function precheckLeashEmail(email: string, options: AuthRequestOptions = {}) {
  const payload = await postJson("/api/leash/auth/precheck", { email }, options);
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("allowed" in payload) ||
    payload.allowed !== true
  ) {
    throw new AuthRequestError(
      "INVALID_AUTH_RESPONSE",
      "Tab received an invalid authentication response.",
      200,
    );
  }
}

export async function verifyLeashDidToken(
  didToken: string,
  email: string,
  options: AuthRequestOptions = {},
) {
  const payload = await postJson("/api/leash/auth/verify", { didToken, email }, options);
  const redirectTo =
    typeof payload === "object" &&
    payload !== null &&
    "redirectTo" in payload &&
    typeof payload.redirectTo === "string"
      ? payload.redirectTo
      : "";

  if (!redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
    throw new AuthRequestError(
      "INVALID_AUTH_RESPONSE",
      "Tab received an invalid authentication response.",
      200,
    );
  }

  return redirectTo;
}
