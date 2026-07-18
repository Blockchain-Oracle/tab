import type { NextRequest } from "next/server";

export const MAX_SIGN_REQUEST_BYTES = 64 * 1_024;
export const SIGN_REQUEST_BODY_TIMEOUT_MS = 5_000;

export class SignRequestBodyError extends Error {
  constructor() {
    super("The signing request body is invalid.");
    this.name = "SignRequestBodyError";
  }
}

function bestEffortCancel(cancel: () => Promise<unknown>) {
  try {
    void cancel().catch(() => undefined);
  } catch {
    // Transport cleanup must not replace the deterministic invalid-request error.
  }
}

function bestEffortRelease(release: () => void) {
  try {
    release();
  } catch {
    // A broken stream cannot change the public invalid-request response.
  }
}

function readDeadline(signal: AbortSignal, timeoutMs: number) {
  let rejectDeadline: (error: SignRequestBodyError) => void = () => undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject;
  });
  const expire = () => rejectDeadline(new SignRequestBodyError());
  const timer = setTimeout(expire, timeoutMs);
  signal.addEventListener("abort", expire, { once: true });
  if (signal.aborted) expire();
  return {
    deadline,
    dispose() {
      clearTimeout(timer);
      signal.removeEventListener("abort", expire);
    },
  };
}

function timeoutMs(value: number | undefined) {
  if (value === undefined) return SIGN_REQUEST_BODY_TIMEOUT_MS;
  if (!Number.isSafeInteger(value) || value < 1) throw new SignRequestBodyError();
  return Math.min(value, SIGN_REQUEST_BODY_TIMEOUT_MS);
}

export async function readSignRequestBody(
  request: Pick<NextRequest, "body" | "headers" | "signal">,
  options: { timeoutMs?: number | undefined } = {},
) {
  const bodyTimeoutMs = timeoutMs(options.timeoutMs);
  const body = request.body;
  if (request.signal.aborted) {
    if (body) bestEffortCancel(() => body.cancel());
    throw new SignRequestBodyError();
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    if (body) bestEffortCancel(() => body.cancel());
    throw new SignRequestBodyError();
  }
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_SIGN_REQUEST_BYTES)) {
    if (body) bestEffortCancel(() => body.cancel());
    throw new SignRequestBodyError();
  }
  if (!body) return "";
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = body.getReader();
  } catch {
    bestEffortCancel(() => body.cancel());
    throw new SignRequestBodyError();
  }
  const timeout = readDeadline(request.signal, bodyTimeoutMs);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await Promise.race([reader.read(), timeout.deadline]);
      } catch {
        bestEffortCancel(() => reader.cancel());
        throw new SignRequestBodyError();
      }
      const { done, value } = result;
      if (done) break;
      length += value.byteLength;
      if (length > MAX_SIGN_REQUEST_BYTES) {
        bestEffortCancel(() => reader.cancel());
        throw new SignRequestBodyError();
      }
      chunks.push(value);
    }
  } finally {
    timeout.dispose();
    bestEffortRelease(() => reader.releaseLock());
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new SignRequestBodyError();
  }
}
