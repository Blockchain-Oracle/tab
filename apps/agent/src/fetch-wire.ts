import { validatePaymentTarget } from "./payment-target-policy.js";

const MAX_BODY_BYTES = 1_048_576;
const MAX_HEADERS = 32;
const MAX_RESPONSE_BYTES = 262_144;
const MAX_URL_LENGTH = 2_048;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const METHODS = new Set(["DELETE", "GET", "HEAD", "PATCH", "POST", "PUT"]);
const FORBIDDEN_HEADERS = new Set(["connection", "content-length", "host", "transfer-encoding"]);

export const PAID_FETCH_INPUT_SCHEMA = {
  additionalProperties: false,
  properties: {
    body: { maxLength: MAX_BODY_BYTES, type: "string" as const },
    headers: {
      additionalProperties: { type: "string" as const },
      maxProperties: MAX_HEADERS,
      type: "object" as const,
    },
    idempotencyKey: {
      maxLength: 128,
      pattern: IDEMPOTENCY_KEY_PATTERN.source,
      type: "string" as const,
    },
    method: { enum: [...METHODS], type: "string" as const },
    url: { maxLength: MAX_URL_LENGTH, type: "string" as const },
  },
  required: ["idempotencyKey", "url"],
  type: "object" as const,
};

export interface ParsedFetchRequest {
  body?: string;
  headers?: Record<string, string>;
  idempotencyKey: string;
  method: string;
  url: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseHeaders(value: unknown) {
  if (value === undefined) return undefined;
  if (!record(value) || Object.keys(value).length > MAX_HEADERS) throw new Error("headers");
  const headers: Record<string, string> = {};
  let totalBytes = 0;
  for (const [name, headerValue] of Object.entries(value)) {
    const normalized = name.toLowerCase();
    if (
      !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name) ||
      FORBIDDEN_HEADERS.has(normalized) ||
      typeof headerValue !== "string" ||
      /[\r\n]/.test(headerValue)
    ) {
      throw new Error("headers");
    }
    totalBytes += Buffer.byteLength(name) + Buffer.byteLength(headerValue);
    if (totalBytes > 32_768) throw new Error("headers");
    headers[name] = headerValue;
  }
  return headers;
}

export function parsePaidFetchRequest(
  value: unknown,
  options: { allowDevelopmentLoopback?: boolean } = {},
): ParsedFetchRequest {
  if (!record(value)) throw new Error("request");
  const keys = Object.keys(value);
  if (keys.some((key) => !["body", "headers", "idempotencyKey", "method", "url"].includes(key))) {
    throw new Error("request");
  }
  if (
    typeof value.idempotencyKey !== "string" ||
    !IDEMPOTENCY_KEY_PATTERN.test(value.idempotencyKey)
  ) {
    throw new Error("idempotencyKey");
  }
  if (
    typeof value.url !== "string" ||
    value.url.length === 0 ||
    value.url.length > MAX_URL_LENGTH
  ) {
    throw new Error("url");
  }
  let url: URL;
  try {
    url = new URL(value.url);
  } catch {
    throw new Error("url");
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    throw new Error("url");
  }
  const method = value.method === undefined ? "GET" : value.method;
  if (typeof method !== "string" || method !== method.toUpperCase() || !METHODS.has(method)) {
    throw new Error("method");
  }
  if (
    value.body !== undefined &&
    (typeof value.body !== "string" ||
      Buffer.byteLength(value.body) > MAX_BODY_BYTES ||
      method === "GET" ||
      method === "HEAD")
  ) {
    throw new Error("body");
  }
  const headers = parseHeaders(value.headers);
  return {
    ...(value.body === undefined ? {} : { body: value.body }),
    ...(headers === undefined ? {} : { headers }),
    idempotencyKey: value.idempotencyKey,
    method,
    url: validatePaymentTarget(url.toString(), options),
  };
}

export async function readBoundedResponse(response: Response) {
  if (!response.body) return { body: "", truncated: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = MAX_RESPONSE_BYTES - length;
    if (value.byteLength > remaining) {
      if (remaining > 0) chunks.push(value.subarray(0, remaining));
      length += Math.max(remaining, 0);
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
    length += value.byteLength;
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body: new TextDecoder().decode(bytes), truncated };
}

export function readResponseHeaders(response: Response) {
  const headers: Record<string, string> = {};
  let count = 0;
  for (const [name, value] of response.headers) {
    if (count >= 64) break;
    headers[name] = value.slice(0, 4_096);
    count += 1;
  }
  return headers;
}
