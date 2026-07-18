import { isAddress } from "viem";

import { validateControlPlaneOrigin } from "./control-plane-origin.js";
import { isPaymentProfile, type PaymentProfile } from "./payment-profile.js";

const MAX_CONNECT_RESPONSE_BYTES = 65_536;

interface ConnectLeashAgentOptions {
  apiBaseUrl: string;
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}

export interface ConnectedLeashAgent {
  address: `0x${string}` | null;
  paymentProfile: PaymentProfile;
}

export class LeashConnectError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "LeashConnectError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(value: unknown) {
  if (!record(value) || !record(value.error) || typeof value.error.code !== "string") {
    return "CONNECT_FAILED";
  }
  return /^[A-Z0-9_]{1,64}$/.test(value.error.code) ? value.error.code : "CONNECT_FAILED";
}

function invalidConnectResponse(): never {
  throw new LeashConnectError(
    "INVALID_CONNECT_RESPONSE",
    "The Leash control plane returned an invalid response.",
    502,
  );
}

async function responseJson(response: Response, signal: AbortSignal) {
  if (!response.body) invalidConnectResponse();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let rejectAbort: ((reason?: unknown) => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const cancelReader = () => {
    void reader.cancel().catch(() => undefined);
  };
  const onAbort = () => {
    cancelReader();
    rejectAbort?.(signal.reason ?? new Error("Aborted"));
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal.aborted) onAbort();
    while (true) {
      const result = await Promise.race([reader.read(), aborted]);
      if (result.done) break;
      length += result.value.byteLength;
      if (length > MAX_CONNECT_RESPONSE_BYTES) {
        cancelReader();
        invalidConnectResponse();
      }
      chunks.push(result.value);
    }
  } catch (error) {
    if (error instanceof LeashConnectError) throw error;
    cancelReader();
    throw new LeashConnectError(
      "CONNECT_FAILED",
      "The Leash control plane could not be reached.",
      503,
    );
  } finally {
    signal.removeEventListener("abort", onAbort);
    try {
      reader.releaseLock();
    } catch {
      // An aborted read may hold the lock until cancellation finishes.
    }
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
    invalidConnectResponse();
  }
}

export async function connectLeashAgent(
  options: ConnectLeashAgentOptions,
): Promise<ConnectedLeashAgent> {
  const fetch_ = options.fetch ?? globalThis.fetch;
  const apiBaseUrl = validateControlPlaneOrigin(options.apiBaseUrl);
  const timeout = AbortSignal.timeout(10_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch_(new URL("/api/agent/connect", apiBaseUrl), {
      body: JSON.stringify({ transport: "mcp" }),
      headers: {
        accept: "application/json",
        authorization: `Bearer ${options.apiKey}`,
        "content-type": "application/json",
      },
      method: "POST",
      redirect: "error",
      signal,
    });
  } catch {
    throw new LeashConnectError(
      "CONNECT_FAILED",
      "The Leash control plane could not be reached.",
      503,
    );
  }

  const body = await responseJson(response, signal);
  if (!response.ok) {
    throw new LeashConnectError(
      errorCode(body),
      "The Leash control plane rejected the connection.",
      response.status,
    );
  }
  if (
    !record(body) ||
    !record(body.agent) ||
    !("address" in body.agent) ||
    !isPaymentProfile(body.paymentProfile)
  ) {
    throw new LeashConnectError(
      "INVALID_CONNECT_RESPONSE",
      "The Leash control plane returned an invalid response.",
      502,
    );
  }
  const address = body.agent.address;
  if (address !== null && (typeof address !== "string" || !isAddress(address))) {
    throw new LeashConnectError(
      "INVALID_CONNECT_RESPONSE",
      "The Leash control plane returned an invalid response.",
      502,
    );
  }
  return { address, paymentProfile: body.paymentProfile } as ConnectedLeashAgent;
}
