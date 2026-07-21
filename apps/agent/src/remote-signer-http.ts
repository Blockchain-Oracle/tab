const MAX_SIGNER_RESPONSE_BYTES = 64 * 1_024;

const SAFE_SERVER_MESSAGES: Readonly<Record<string, string>> = {
  AGENT_CANCELLED: "The signing request cannot proceed.",
  AGENT_FROZEN: "The signing request cannot proceed.",
  AGENT_PAUSED: "The signing request cannot proceed.",
  AUTHORIZATION_EXPIRED: "The signing authorization has expired.",
  CAP_CYCLE_CHANGED: "The signing request cannot proceed.",
  FLOAT_CHECK_UNAVAILABLE: "The agent balance could not be verified.",
  FLOAT_EMPTY: "The agent does not have enough available funds.",
  INVALID_AGENT_KEY: "The agent key was rejected.",
  INVALID_SIGN_REQUEST: "The signing request is invalid.",
  CAP_EXCEEDED: "The signing request exceeds the active cap.",
  CAP_NOT_SET: "The agent does not have an active cap.",
  SIGNER_IDENTITY_MISMATCH: "The signing provider returned the wrong identity.",
  SIGNER_NOT_CONFIGURED: "Agent signing is not configured for this agent.",
  SIGNER_PROVIDER_INVALID_RESPONSE: "The signing provider returned an invalid response.",
  SIGNER_PROVIDER_RATE_LIMITED: "The signing provider is rate limited.",
  SIGNER_PROVIDER_REJECTED: "The signing provider rejected the request.",
  SIGNER_PROVIDER_TIMEOUT: "The signing provider timed out.",
  SIGNER_PROVIDER_UNAVAILABLE: "The signing provider is unavailable.",
  SIGN_RATE_LIMITED: "Signing is temporarily rate limited.",
  SIGN_REQUEST_CONFLICT: "The signing request conflicts with an existing request.",
  SIGN_REQUEST_IN_PROGRESS: "A matching signing request is already in progress.",
  SIGN_REQUEST_RECONCILING: "A matching signing request is being reconciled.",
};

export class RemoteSignerError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RemoteSignerError";
  }
}

function invalidResponse(): never {
  throw new RemoteSignerError("INVALID_SIGNER_RESPONSE", "The signer response is invalid.", 502);
}

function isJsonContentType(value: string | null) {
  if (!value) return false;
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return (
    mediaType === "application/json" || /^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(mediaType)
  );
}

function contentLength(response: Response) {
  const value = response.headers.get("content-length");
  if (value === null) return null;
  if (!/^(0|[1-9]\d*)$/.test(value)) invalidResponse();
  const length = Number(value);
  if (!Number.isSafeInteger(length)) invalidResponse();
  return length;
}

export async function readRemoteSignerJson(response: Response, signal?: AbortSignal) {
  const cancelBody = () => response.body?.cancel().catch(() => undefined);
  if (!isJsonContentType(response.headers.get("content-type"))) {
    await cancelBody();
    invalidResponse();
  }
  let declaredLength: number | null;
  try {
    declaredLength = contentLength(response);
  } catch {
    await cancelBody();
    invalidResponse();
  }
  if (declaredLength !== null && declaredLength > MAX_SIGNER_RESPONSE_BYTES) {
    await cancelBody();
    invalidResponse();
  }
  if (!response.body) invalidResponse();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let rejectAbort: ((reason?: unknown) => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => {
    void reader.cancel().catch(() => undefined);
    rejectAbort?.(signal?.reason ?? new Error("Aborted"));
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal?.aborted) onAbort();
    while (true) {
      const result = signal ? await Promise.race([reader.read(), aborted]) : await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > MAX_SIGNER_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        invalidResponse();
      }
      chunks.push(result.value);
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    invalidResponse();
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serverError(response: Response, body: unknown) {
  const code = record(body) && record(body.error) ? body.error.code : undefined;
  if (typeof code === "string" && Object.hasOwn(SAFE_SERVER_MESSAGES, code)) {
    return new RemoteSignerError(code, SAFE_SERVER_MESSAGES[code] as string, response.status);
  }
  return new RemoteSignerError(
    "SIGNER_REQUEST_FAILED",
    "The signer request failed.",
    response.status,
  );
}

function jsonBody(value: unknown) {
  return JSON.stringify(value, (_key, field) =>
    typeof field === "bigint" ? field.toString() : field,
  );
}

interface SignerPostOptions {
  apiKey: string;
  body: unknown;
  endpoint: URL;
  fetch: typeof globalThis.fetch;
  signal?: AbortSignal;
  timeoutMs: number;
}

export async function postRemoteSignerJson(options: SignerPostOptions) {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(
        new RemoteSignerError("SIGNER_REQUEST_TIMEOUT", "The agent control plane timed out.", 504),
      );
    }, options.timeoutMs);
  });
  const request = async () => {
    const signal = options.signal
      ? AbortSignal.any([controller.signal, options.signal])
      : controller.signal;
    const response = await options.fetch(options.endpoint, {
      body: jsonBody(options.body),
      headers: {
        accept: "application/json",
        authorization: `Bearer ${options.apiKey}`,
        "content-type": "application/json",
      },
      method: "POST",
      redirect: "error",
      signal,
    });
    const body = await readRemoteSignerJson(response, signal);
    if (!response.ok) throw serverError(response, body);
    return body;
  };
  try {
    return await Promise.race([request(), deadline]);
  } catch (error) {
    if (error instanceof RemoteSignerError) throw error;
    if (options.signal?.aborted) {
      throw new RemoteSignerError(
        "SIGNER_REQUEST_CANCELLED",
        "The Agent signing request was cancelled.",
        499,
      );
    }
    if (timedOut) {
      throw new RemoteSignerError(
        "SIGNER_REQUEST_TIMEOUT",
        "The agent control plane timed out.",
        504,
      );
    }
    throw new RemoteSignerError(
      "SIGNER_REQUEST_UNAVAILABLE",
      "The agent control plane could not be reached.",
      503,
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}
