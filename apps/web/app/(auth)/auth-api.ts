import type { AuthFlow } from "./auth-copy";

type AuthRequester = (input: string, init: RequestInit) => Promise<Response>;

type AuthRequestOptions = {
  request?: AuthRequester;
  signal?: AbortSignal;
};

type ErrorBody = {
  error?: { code?: unknown; message?: unknown };
};

export class AuthRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "AuthRequestError";
    this.code = code;
    this.status = status;
  }
}

const browserRequest: AuthRequester = (input, init) => fetch(input, init);

async function postJson(
  path: string,
  body: Record<string, string>,
  request: AuthRequester,
  signal?: AbortSignal,
) {
  let response: Response;
  const init: RequestInit = {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  };

  if (signal) init.signal = signal;

  try {
    response = await request(path, init);
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
    const error = (payload as ErrorBody).error;
    const code = typeof error?.code === "string" ? error.code : "AUTH_REQUEST_FAILED";
    const message =
      typeof error?.message === "string" ? error.message : "Authentication could not be completed.";
    throw new AuthRequestError(code, message, response.status);
  }

  return payload;
}

export async function precheckEmail(
  email: string,
  flow: AuthFlow,
  options: AuthRequestOptions = {},
) {
  const payload = await postJson(
    "/api/auth/precheck",
    { email, flow },
    options.request ?? browserRequest,
    options.signal,
  );

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

export async function verifyDidToken(
  didToken: string,
  flow: AuthFlow,
  options: AuthRequestOptions = {},
) {
  const payload = await postJson(
    "/api/auth/verify",
    { didToken, flow },
    options.request ?? browserRequest,
    options.signal,
  );
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
