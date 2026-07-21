import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import {
  PAID_FETCH_INPUT_SCHEMA,
  type ParsedFetchRequest,
  parsePaidFetchRequest,
  readBoundedResponse,
  readResponseHeaders,
} from "./fetch-wire.js";
import { createTabFetch } from "./fetch-wrapper.js";
import { withPaymentIdempotencyKey } from "./payment-idempotency.js";
import type { PaymentProfile } from "./payment-profile.js";
import { withPaymentSignal } from "./payment-signal.js";
import { createPinnedPaymentFetch, type PaymentTargetLookup } from "./payment-target-network.js";
import type { TabRemoteSigner } from "./remote-signer.js";

interface PaidFetchServerOptions {
  address: `0x${string}` | null;
  allowDevelopmentLoopback?: boolean;
  apiBaseUrl: string;
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  lookup?: PaymentTargetLookup;
  paymentProfile: PaymentProfile;
  signer?: TabRemoteSigner;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toolResponse(value: unknown, isError = false) {
  return {
    content: [{ text: JSON.stringify(value), type: "text" as const }],
    ...(isError ? { isError: true } : {}),
  };
}

function invalidRequest() {
  return toolResponse(
    { error: { code: "INVALID_FETCH_REQUEST", message: "The fetch request is invalid." } },
    true,
  );
}

export function createPaidFetchServer(options: PaidFetchServerOptions) {
  const server = new Server({ name: "tab-mcp", version: "0.0.1" }, { capabilities: { tools: {} } });
  const allowDevelopmentLoopback = options.allowDevelopmentLoopback === true;
  const baseFetch = options.fetch ?? globalThis.fetch;
  const standalonePolicy = options.address
    ? undefined
    : createPinnedPaymentFetch({
        allowDevelopmentLoopback,
        fetch: baseFetch,
        ...(options.lookup ? { lookup: options.lookup } : {}),
      });
  const leashFetch = options.address
    ? createTabFetch({
        address: options.address,
        allowDevelopmentLoopback,
        apiBaseUrl: options.apiBaseUrl,
        apiKey: options.apiKey,
        clientName: () => server.getClientVersion()?.name ?? "Unknown client",
        fetch: baseFetch,
        ...(options.lookup ? { lookup: options.lookup } : {}),
        paymentProfile: options.paymentProfile,
        ...(options.signer ? { signer: options.signer } : {}),
      })
    : undefined;
  const fetch_ = leashFetch ?? standalonePolicy?.fetch;
  if (!fetch_) throw new Error("The paid fetch target policy is unavailable");
  server.onclose = () => {
    void (leashFetch?.close() ?? standalonePolicy?.close());
  };
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        description:
          "Fetch an HTTP resource and pay a supported x402 challenge within owner policy.",
        inputSchema: PAID_FETCH_INPUT_SCHEMA,
        name: "paid_fetch",
      },
    ],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    if (request.params.name !== "paid_fetch") return invalidRequest();
    let input: ParsedFetchRequest;
    try {
      input = parsePaidFetchRequest(request.params.arguments, {
        allowDevelopmentLoopback,
      });
    } catch {
      return invalidRequest();
    }
    try {
      const signal = AbortSignal.any([extra.signal, AbortSignal.timeout(30_000)]);
      const response = await withPaymentSignal(signal, () =>
        withPaymentIdempotencyKey(input.idempotencyKey, () =>
          fetch_(input.url, {
            ...(input.body === undefined ? {} : { body: input.body }),
            ...(input.headers === undefined ? {} : { headers: input.headers }),
            method: input.method,
            signal,
          }),
        ),
      );
      if (!options.address && response.status === 402) {
        void response.body?.cancel().catch(() => undefined);
        return toolResponse(
          {
            error: {
              code: "SIGNER_NOT_CONFIGURED",
              message: "Agent signing is not configured for this agent.",
            },
          },
          true,
        );
      }
      const content = await readBoundedResponse(response);
      return toolResponse({
        ...content,
        headers: readResponseHeaders(response),
        status: response.status,
        statusText: response.statusText,
        url: response.url,
      });
    } catch (error) {
      const remoteCode = record(error) && typeof error.code === "string" ? error.code : "";
      const code = /^[A-Z0-9_]{1,64}$/.test(remoteCode) ? remoteCode : "FETCH_FAILED";
      return toolResponse({ error: { code, message: "The fetch request failed." } }, true);
    }
  });
  return server;
}
