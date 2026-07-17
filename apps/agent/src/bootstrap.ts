import { isAddress } from "viem";

const MAX_CONNECT_RESPONSE_BYTES = 65_536;

interface ConnectLeashAgentOptions {
  apiBaseUrl: string;
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}

export interface ConnectedLeashAgent {
  address: `0x${string}` | null;
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

async function responseJson(response: Response) {
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_CONNECT_RESPONSE_BYTES) {
    throw new LeashConnectError(
      "INVALID_CONNECT_RESPONSE",
      "The Leash control plane returned an invalid response.",
      502,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new LeashConnectError(
      "INVALID_CONNECT_RESPONSE",
      "The Leash control plane returned an invalid response.",
      502,
    );
  }
}

export async function connectLeashAgent(
  options: ConnectLeashAgentOptions,
): Promise<ConnectedLeashAgent> {
  const fetch_ = options.fetch ?? globalThis.fetch;
  const timeout = AbortSignal.timeout(10_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch_(new URL("/api/agent/connect", options.apiBaseUrl), {
      body: JSON.stringify({ transport: "mcp" }),
      headers: {
        accept: "application/json",
        authorization: `Bearer ${options.apiKey}`,
        "content-type": "application/json",
      },
      method: "POST",
      signal,
    });
  } catch {
    throw new LeashConnectError(
      "CONNECT_FAILED",
      "The Leash control plane could not be reached.",
      503,
    );
  }

  const body = await responseJson(response);
  if (!response.ok) {
    throw new LeashConnectError(
      errorCode(body),
      "The Leash control plane rejected the connection.",
      response.status,
    );
  }
  if (!record(body) || !record(body.agent) || !("address" in body.agent)) {
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
  return { address } as ConnectedLeashAgent;
}
