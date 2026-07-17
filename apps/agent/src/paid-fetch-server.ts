import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import {
  PAID_FETCH_INPUT_SCHEMA,
  type ParsedFetchRequest,
  parsePaidFetchRequest,
  readBoundedResponse,
  readResponseHeaders,
} from "./fetch-wire.js";
import { createLeashFetch } from "./fetch-wrapper.js";

interface PaidFetchServerOptions {
  address: `0x${string}` | null;
  apiBaseUrl: string;
  apiKey: string;
  fetch?: typeof globalThis.fetch;
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
  const server = new Server(
    { name: "leash-mcp", version: "0.0.1" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        description:
          "Fetch an HTTP resource and pay a supported x402 challenge within Leash policy.",
        inputSchema: PAID_FETCH_INPUT_SCHEMA,
        name: "paid_fetch",
      },
    ],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== "paid_fetch") return invalidRequest();
    let input: ParsedFetchRequest;
    try {
      input = parsePaidFetchRequest(request.params.arguments);
    } catch {
      return invalidRequest();
    }
    const baseFetch = options.fetch ?? globalThis.fetch;
    const fetch_ = options.address
      ? createLeashFetch({
          address: options.address,
          apiBaseUrl: options.apiBaseUrl,
          apiKey: options.apiKey,
          clientName: server.getClientVersion()?.name ?? "Unknown client",
          fetch: baseFetch,
        })
      : baseFetch;
    let response: Response;
    try {
      response = await fetch_(input.url, {
        ...(input.body === undefined ? {} : { body: input.body }),
        ...(input.headers === undefined ? {} : { headers: input.headers }),
        method: input.method,
      });
    } catch (error) {
      const remoteCode = record(error) && typeof error.code === "string" ? error.code : "";
      const code = /^[A-Z0-9_]{1,64}$/.test(remoteCode) ? remoteCode : "FETCH_FAILED";
      return toolResponse({ error: { code, message: "The fetch request failed." } }, true);
    }
    if (!options.address && response.status === 402) {
      await response.body?.cancel();
      return toolResponse(
        {
          error: {
            code: "SIGNER_NOT_CONFIGURED",
            message: "Leash signing is not configured for this agent.",
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
  });
  return server;
}
