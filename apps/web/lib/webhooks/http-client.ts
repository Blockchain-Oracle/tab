import { request as httpRequest, validateHeaderName, validateHeaderValue } from "node:http";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { isIP } from "node:net";
import { performance } from "node:perf_hooks";
import { StringDecoder } from "node:string_decoder";

import type { WebhookEnvironment } from "./endpoint-url";
import {
  type PinnedWebhookAddress,
  pinnedWebhookLookup,
  resolvePinnedWebhookAddress,
  UnsafeWebhookAddressError,
  type WebhookAddressResolver,
} from "./http-address-policy";
import { appendWebhookResponseSnippet } from "./http-response-snippet";

export type WebhookHttpErrorKind = "config" | "network" | "timeout";

export class WebhookHttpClientError extends Error {
  readonly code: `WEBHOOK_HTTP_${Uppercase<WebhookHttpErrorKind>}`;

  constructor(readonly kind: WebhookHttpErrorKind) {
    super(
      kind === "timeout"
        ? "Webhook delivery timed out"
        : kind === "network"
          ? "Webhook delivery network request failed"
          : "Webhook delivery configuration rejected",
    );
    this.name = "WebhookHttpClientError";
    this.code = `WEBHOOK_HTTP_${kind.toUpperCase()}` as typeof this.code;
  }
}

export interface WebhookHttpRequest {
  allowLocalHttp?: boolean;
  body: string;
  endpointUrl: string;
  environment: WebhookEnvironment;
  headers: Readonly<Record<string, string>>;
  timeoutMs?: number;
}

export interface WebhookHttpResult {
  durationMs: number;
  responseSnippet: string;
  statusCode: number;
}

const forbiddenHeaders = new Set([
  "connection",
  "content-length",
  "expect",
  "host",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function configuration(request: WebhookHttpRequest) {
  if (
    typeof request.body !== "string" ||
    typeof request.endpointUrl !== "string" ||
    (request.environment !== "live" && request.environment !== "test")
  ) {
    throw new WebhookHttpClientError("config");
  }
  let endpoint: URL;
  try {
    endpoint = new URL(request.endpointUrl);
  } catch {
    throw new WebhookHttpClientError("config");
  }
  const hostname = endpoint.hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
  const explicitLoopback = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:[/?]|$)/i.test(
    request.endpointUrl,
  );
  const localTest =
    request.allowLocalHttp === true &&
    process.env.NODE_ENV === "test" &&
    request.environment === "test" &&
    endpoint.protocol === "http:" &&
    explicitLoopback;
  const httpsEndpoint = endpoint.protocol === "https:";
  if (
    (!localTest && !httpsEndpoint) ||
    (request.environment === "live" && !httpsEndpoint) ||
    endpoint.username !== "" ||
    endpoint.password !== "" ||
    endpoint.hash !== ""
  ) {
    throw new WebhookHttpClientError("config");
  }
  const timeoutMs = request.timeoutMs ?? 10_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
    throw new WebhookHttpClientError("config");
  }
  const headers: Record<string, string> = {};
  try {
    for (const [name, value] of Object.entries(request.headers)) {
      if (forbiddenHeaders.has(name.toLowerCase()) || typeof value !== "string") throw new Error();
      validateHeaderName(name);
      validateHeaderValue(name, value);
      headers[name] = value;
    }
  } catch {
    throw new WebhookHttpClientError("config");
  }
  return { endpoint, headers, hostname, localTest, timeoutMs };
}

async function post(
  request: WebhookHttpRequest,
  config: ReturnType<typeof configuration>,
  pinned: PinnedWebhookAddress,
  signal: AbortSignal,
  started: number,
): Promise<WebhookHttpResult> {
  if (signal.aborted) throw new Error("aborted");
  const body = Buffer.from(request.body, "utf8");
  const headers = { ...config.headers, "content-length": String(body.byteLength) };
  const requester = config.endpoint.protocol === "https:" ? httpsRequest : httpRequest;
  const servername = isIP(config.hostname) === 0 ? config.hostname : undefined;
  const options: RequestOptions = {
    agent: false,
    headers,
    hostname: config.hostname,
    lookup: pinnedWebhookLookup(pinned),
    method: "POST",
    path: `${config.endpoint.pathname}${config.endpoint.search}`,
    port: config.endpoint.port || undefined,
    signal,
    ...(servername ? { servername } : {}),
  };

  return new Promise((resolve, reject) => {
    const outgoing = requester(options, (response) => {
      const decoder = new StringDecoder("utf8");
      let state = { characters: 0, snippet: "" };
      response.on("data", (chunk: Buffer) => {
        state = appendWebhookResponseSnippet(state, decoder.write(chunk));
      });
      response.on("aborted", () => reject(new Error("Response aborted")));
      response.on("error", reject);
      response.on("end", () => {
        state = appendWebhookResponseSnippet(state, decoder.end());
        const statusCode = response.statusCode;
        if (statusCode === undefined || statusCode < 100 || statusCode > 599) {
          reject(new Error("Invalid webhook response status"));
          return;
        }
        resolve({
          durationMs: Math.max(0, Math.round(performance.now() - started)),
          responseSnippet: state.snippet,
          statusCode,
        });
      });
    });
    outgoing.on("error", reject);
    outgoing.end(body);
  });
}

export async function sendWebhookHttpRequest(
  request: WebhookHttpRequest,
  resolver?: WebhookAddressResolver,
) {
  const config = configuration(request);
  const started = performance.now();
  const abort = new AbortController();
  let timedOut = false;
  const timeout = new Promise<never>((_resolve, reject) => {
    abort.signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
  });
  const timer = setTimeout(() => {
    timedOut = true;
    abort.abort();
  }, config.timeoutMs);
  timer.unref();
  try {
    const operation = resolvePinnedWebhookAddress(config.hostname, config.localTest, resolver).then(
      (pinned) => post(request, config, pinned, abort.signal, started),
    );
    return await Promise.race([operation, timeout]);
  } catch (error) {
    if (error instanceof WebhookHttpClientError) throw error;
    if (timedOut) throw new WebhookHttpClientError("timeout");
    if (error instanceof UnsafeWebhookAddressError) throw new WebhookHttpClientError("config");
    throw new WebhookHttpClientError("network");
  } finally {
    clearTimeout(timer);
  }
}
