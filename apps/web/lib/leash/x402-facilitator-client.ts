import type { FacilitatorClient, FacilitatorConfig } from "@x402/core/server";
import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedResponse,
  VerifyResponse,
} from "@x402/core/types";

import { parseFacilitatorSuccess, throwFacilitatorFailure } from "./x402-facilitator-response";

const DEFAULT_FACILITATOR_URL = "https://x402.org/facilitator";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 32 * 1_024;
const GET_SUPPORTED_RETRIES = 3;
const GET_SUPPORTED_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;

type Operation = "settle" | "supported" | "verify";

export class X402FacilitatorTransportError extends Error {
  constructor(
    readonly code:
      | "X402_FACILITATOR_RESPONSE_TOO_LARGE"
      | "X402_FACILITATOR_TIMEOUT"
      | "X402_FACILITATOR_UNAVAILABLE",
  ) {
    super(
      code === "X402_FACILITATOR_TIMEOUT"
        ? "The x402 facilitator timed out."
        : code === "X402_FACILITATOR_RESPONSE_TOO_LARGE"
          ? "The x402 facilitator response exceeded the allowed size."
          : "The x402 facilitator is unavailable.",
    );
    this.name = "X402FacilitatorTransportError";
  }
}

interface HardenedHTTPFacilitatorClientOptions extends FacilitatorConfig {
  fetch?: typeof globalThis.fetch;
  maxResponseBytes?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
  url?: string;
}

function positiveInteger(value: number, label: string, maximum: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`The x402 facilitator ${label} is invalid.`);
  }
  return value;
}

async function cancel(response: Response) {
  await response.body?.cancel().catch(() => undefined);
}

async function readBoundedText(response: Response, maximumBytes: number, signal: AbortSignal) {
  const declared = response.headers.get("content-length");
  if (declared && (!/^(0|[1-9]\d*)$/.test(declared) || Number(declared) > maximumBytes)) {
    await cancel(response);
    throw new X402FacilitatorTransportError("X402_FACILITATOR_RESPONSE_TOO_LARGE");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let rejectAbort: ((reason?: unknown) => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => {
    void reader.cancel().catch(() => undefined);
    rejectAbort?.(new X402FacilitatorTransportError("X402_FACILITATOR_TIMEOUT"));
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal.aborted) onAbort();
    while (true) {
      const result = await Promise.race([reader.read(), aborted]);
      if (result.done) break;
      length += result.value.byteLength;
      if (length > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new X402FacilitatorTransportError("X402_FACILITATOR_RESPONSE_TOO_LARGE");
      }
      chunks.push(result.value);
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function computeRetryDelay(retryAfter: string | null, attempt: number) {
  let delay: number | null = null;
  if (retryAfter !== null) {
    const value = retryAfter.trim();
    if (/^\d+$/.test(value)) delay = Number(value) * 1_000;
    else {
      const date = Date.parse(value);
      if (!Number.isNaN(date)) delay = date - Date.now();
    }
  }
  if (delay === null || delay <= 0) {
    delay = GET_SUPPORTED_RETRY_DELAY_MS * 2 ** attempt;
  }
  return Math.min(delay, MAX_RETRY_DELAY_MS);
}

function jsonSafe(value: unknown) {
  return JSON.parse(
    JSON.stringify(value, (_key, field) => (typeof field === "bigint" ? field.toString() : field)),
  ) as unknown;
}

export class HardenedHTTPFacilitatorClient implements FacilitatorClient {
  readonly url: string;
  readonly #createAuthHeaders: FacilitatorConfig["createAuthHeaders"];
  readonly #fetch: typeof globalThis.fetch;
  readonly #maxResponseBytes: number;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  readonly #timeoutMs: number;

  constructor(options: HardenedHTTPFacilitatorClientOptions = {}) {
    this.url = (options.url || DEFAULT_FACILITATOR_URL).replace(/\/+$/, "");
    this.#createAuthHeaders = options.createAuthHeaders;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#maxResponseBytes = positiveInteger(
      options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
      "response limit",
      1024 * 1024,
    );
    this.#timeoutMs = positiveInteger(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, "timeout", 60_000);
    this.#sleep =
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    const result = await this.request("verify", "POST", paymentPayload, paymentRequirements);
    if (!result.response.ok) {
      throwFacilitatorFailure("verify", result.response.status, result.text);
    }
    return parseFacilitatorSuccess("verify", result.text);
  }

  async settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const result = await this.request("settle", "POST", paymentPayload, paymentRequirements);
    if (!result.response.ok) {
      throwFacilitatorFailure(
        "settle",
        result.response.status,
        result.text,
        paymentRequirements.network as Network,
      );
    }
    return parseFacilitatorSuccess("settle", result.text);
  }

  async getSupported(): Promise<SupportedResponse> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < GET_SUPPORTED_RETRIES; attempt += 1) {
      const result = await this.request("supported", "GET");
      if (result.response.ok) return parseFacilitatorSuccess("supported", result.text);
      try {
        throwFacilitatorFailure("supported", result.response.status, result.text);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Facilitator supported failed.");
      }
      if (result.response.status !== 429 || attempt === GET_SUPPORTED_RETRIES - 1) {
        throw lastError;
      }
      await this.#sleep(computeRetryDelay(result.response.headers.get("retry-after"), attempt));
    }
    throw lastError ?? new Error("Facilitator getSupported failed after retries.");
  }

  private async request(
    operation: Operation,
    method: "GET" | "POST",
    paymentPayload?: PaymentPayload,
    paymentRequirements?: PaymentRequirements,
  ) {
    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new X402FacilitatorTransportError("X402_FACILITATOR_TIMEOUT"));
      }, this.#timeoutMs);
    });
    const request = async () => {
      const headers = {
        "Content-Type": "application/json",
        ...(this.#createAuthHeaders ? (await this.#createAuthHeaders())[operation] : {}),
      };
      const response = await this.#fetch(`${this.url}/${operation}`, {
        ...(method === "POST"
          ? {
              body: JSON.stringify({
                paymentPayload: jsonSafe(paymentPayload),
                paymentRequirements: jsonSafe(paymentRequirements),
                x402Version: paymentPayload?.x402Version,
              }),
            }
          : {}),
        headers,
        method,
        redirect: "error",
        signal: controller.signal,
      });
      const text = await readBoundedText(response, this.#maxResponseBytes, controller.signal);
      return { response, text };
    };
    try {
      return await Promise.race([request(), deadline]);
    } catch (error) {
      if (error instanceof X402FacilitatorTransportError) throw error;
      if (timedOut) {
        throw new X402FacilitatorTransportError("X402_FACILITATOR_TIMEOUT");
      }
      throw new X402FacilitatorTransportError("X402_FACILITATOR_UNAVAILABLE");
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
