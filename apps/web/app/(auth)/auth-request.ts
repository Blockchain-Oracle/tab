type AuthRequester = (input: string, init: RequestInit) => Promise<Response>;

export type AuthRequestOptions = {
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

function invalidResponse() {
  return new AuthRequestError(
    "INVALID_AUTH_RESPONSE",
    "Tab received an invalid authentication response.",
    200,
  );
}

export interface EmailOtpAuthApi {
  precheck(email: string, options?: AuthRequestOptions): Promise<void>;
  verifyDidToken(didToken: string, email: string, options?: AuthRequestOptions): Promise<string>;
}

/**
 * Email-OTP auth API client bound to a precheck/verify endpoint pair.
 * `extraBody` carries flow-specific fields (e.g. the merchant `flow`).
 */
export function createEmailOtpAuthApi(config: {
  precheckPath: string;
  verifyPath: string;
  extraBody?: Record<string, string>;
}): EmailOtpAuthApi {
  const extra = config.extraBody ?? {};

  return {
    async precheck(email, options = {}) {
      const payload = await postJson(config.precheckPath, { email, ...extra }, options);
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("allowed" in payload) ||
        payload.allowed !== true
      ) {
        throw invalidResponse();
      }
    },

    async verifyDidToken(didToken, email, options = {}) {
      const payload = await postJson(config.verifyPath, { didToken, email, ...extra }, options);
      const redirectTo =
        typeof payload === "object" &&
        payload !== null &&
        "redirectTo" in payload &&
        typeof payload.redirectTo === "string"
          ? payload.redirectTo
          : "";

      if (!redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
        throw invalidResponse();
      }

      return redirectTo;
    },
  };
}
