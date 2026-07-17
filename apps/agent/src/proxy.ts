import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { x402Client } from "@x402/core/client";
import type { SettleResponse } from "@x402/core/types";
import { MCP_PAYMENT_META_KEY, MCP_PAYMENT_RESPONSE_META_KEY } from "@x402/mcp";

import { detectMcpPaymentRequired } from "./detect.js";
import { withPaymentOrigin } from "./origin-context.js";
import type { LeashRemoteSigner } from "./remote-signer.js";

interface LeashProxyOptions {
  paymentClient: x402Client;
  signer: LeashRemoteSigner;
  upstream: Client;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function settlementFromResult(result: unknown): SettleResponse | null {
  if (!record(result) || !record(result._meta)) return null;
  const settlement = result._meta[MCP_PAYMENT_RESPONSE_META_KEY];
  if (
    !record(settlement) ||
    typeof settlement.success !== "boolean" ||
    typeof settlement.network !== "string" ||
    typeof settlement.transaction !== "string"
  ) {
    return null;
  }
  return settlement as SettleResponse;
}

export function createLeashProxyServer(options: LeashProxyOptions) {
  const server = new Server(
    { name: "leash-mcp", version: "0.0.1" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, (request, extra) =>
    options.upstream.listTools(request.params, { signal: extra.signal }),
  );

  server.setRequestHandler(CallToolRequestSchema, (request, extra) =>
    withPaymentOrigin(
      {
        clientName: server.getClientVersion()?.name ?? "Unknown client",
        toolName: request.params.name,
        transport: "mcp",
      },
      async () => {
        let challenge = null;
        let initialResult: Awaited<ReturnType<Client["callTool"]>> | undefined;
        try {
          initialResult = await options.upstream.callTool(request.params, undefined, {
            signal: extra.signal,
          });
          challenge = detectMcpPaymentRequired(initialResult);
        } catch (error) {
          challenge = detectMcpPaymentRequired(error);
          if (!challenge) throw error;
        }
        if (!challenge) {
          if (!initialResult) throw new Error("Upstream tool returned no result");
          return initialResult;
        }

        const paymentPayload = await options.paymentClient.createPaymentPayload(challenge);
        const paidResult = await options.upstream.callTool(
          {
            ...request.params,
            _meta: {
              ...request.params._meta,
              [MCP_PAYMENT_META_KEY]: paymentPayload,
            },
          },
          undefined,
          { signal: extra.signal },
        );
        const settlement = settlementFromResult(paidResult);
        if (settlement) {
          await options.paymentClient.handlePaymentResponse({
            paymentPayload,
            requirements: paymentPayload.accepted,
            settleResponse: settlement,
          });
        }
        return paidResult;
      },
    ),
  );

  return server;
}
