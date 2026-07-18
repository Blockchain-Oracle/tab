import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { SettleResponse } from "@x402/core/types";
import { MCP_PAYMENT_META_KEY, MCP_PAYMENT_RESPONSE_META_KEY } from "@x402/mcp";

import { detectMcpPaymentRequired } from "./detect.js";
import type { DurableMcpPayment, McpPaymentContext } from "./durable-mcp-payment.js";
import { SignerNotConfiguredError } from "./errors.js";
import { withPaymentOrigin, withPaymentResourceUrl } from "./origin-context.js";
import { parsePaymentSettlementObservation } from "./payment-settlement-observation.js";
import { withPaymentSignal } from "./payment-signal.js";

interface LeashProxyOptions {
  payment?: DurableMcpPayment;
  upstream: Client;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readMcpSettlementMetadata(
  result: unknown,
  expected: { amount?: string; network?: string } = {},
): SettleResponse | null {
  if (!record(result) || !record(result._meta)) return null;
  return parsePaymentSettlementObservation(result._meta[MCP_PAYMENT_RESPONSE_META_KEY], expected);
}

export function createLeashProxyServer(options: LeashProxyOptions) {
  const server = new Server(
    { name: "leash-mcp", version: "0.0.1" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, (request, extra) =>
    options.upstream.listTools(request.params, { signal: extra.signal }),
  );

  async function paidCall(
    params: Parameters<Client["callTool"]>[0],
    context: McpPaymentContext,
    signal: AbortSignal,
  ) {
    const paidResult = await options.upstream.callTool(
      {
        ...params,
        _meta: {
          ...params._meta,
          [MCP_PAYMENT_META_KEY]: context.payload,
        },
      },
      undefined,
      { signal },
    );
    const settlement = readMcpSettlementMetadata(paidResult, {
      amount: context.payload.accepted.amount,
      network: context.payload.accepted.network,
    });
    if (settlement) await options.payment?.observe(context, settlement);
    return paidResult;
  }

  server.setRequestHandler(CallToolRequestSchema, (request, extra) => {
    const signal = AbortSignal.any([extra.signal, AbortSignal.timeout(30_000)]);
    return withPaymentSignal(signal, () =>
      withPaymentOrigin(
        {
          clientName: server.getClientVersion()?.name ?? "Unknown client",
          toolName: request.params.name,
          transport: "mcp",
        },
        async () => {
          const pending = await options.payment?.load(request.params);
          if (pending) return paidCall(request.params, pending, signal);

          let challenge = null;
          let initialResult: Awaited<ReturnType<Client["callTool"]>> | undefined;
          try {
            initialResult = await options.upstream.callTool(request.params, undefined, {
              signal,
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
          const payment = options.payment;
          if (!payment) throw new SignerNotConfiguredError();

          const context = await withPaymentResourceUrl(challenge.resource.url, () =>
            payment.create(request.params, challenge),
          );
          return paidCall(request.params, context, signal);
        },
      ),
    );
  });

  return server;
}
