import type { Readable, Writable } from "node:stream";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { connectLeashAgent } from "./bootstrap.js";
import type { LeashCliConfig } from "./cli-config.js";
import { createDurableMcpPayment } from "./durable-mcp-payment.js";
import { createPaidFetchServer } from "./paid-fetch-server.js";
import { createLeashPaymentClient } from "./payment-client.js";
import { defaultPaymentStateDirectory, PaymentEnvelopeStore } from "./payment-envelope-store.js";
import { createLeashProxyServer } from "./proxy.js";
import { LeashRemoteSigner } from "./remote-signer.js";
import { connectStreamableHttpUpstream } from "./upstream.js";

interface StartLeashMcpOptions {
  config: LeashCliConfig;
  fetch?: typeof globalThis.fetch;
  stdin?: Readable;
  stdout?: Writable;
}

export interface LeashMcpRuntime {
  close(): Promise<void>;
}

export async function startLeashMcp(options: StartLeashMcpOptions): Promise<LeashMcpRuntime> {
  const fetch_ = options.fetch ?? globalThis.fetch;
  const agent = await connectLeashAgent({
    apiBaseUrl: options.config.apiBaseUrl,
    apiKey: options.config.apiKey,
    fetch: fetch_,
  });

  let signer: LeashRemoteSigner | undefined;
  let upstreamConnection: Awaited<ReturnType<typeof connectStreamableHttpUpstream>> | undefined;
  if (agent.address) {
    signer = new LeashRemoteSigner({
      address: agent.address,
      apiBaseUrl: options.config.apiBaseUrl,
      apiKey: options.config.apiKey,
      fetch: fetch_,
      paymentProfile: agent.paymentProfile,
    });
  }
  if (options.config.upstreamUrl) {
    upstreamConnection = await connectStreamableHttpUpstream(options.config.upstreamUrl, {
      allowDevelopmentLoopback: options.config.allowDevelopmentLoopback,
      fetch: fetch_,
    });
  }
  const upstream = upstreamConnection?.client;

  const server = upstream
    ? createLeashProxyServer({
        ...(signer
          ? {
              payment: createDurableMcpPayment({
                address: signer.address,
                client: createLeashPaymentClient(signer, agent.paymentProfile),
                paymentProfile: agent.paymentProfile,
                signer,
                store: new PaymentEnvelopeStore(signer.address, defaultPaymentStateDirectory()),
              }),
            }
          : {}),
        upstream,
      })
    : createPaidFetchServer({
        address: agent.address,
        allowDevelopmentLoopback: options.config.allowDevelopmentLoopback,
        apiBaseUrl: options.config.apiBaseUrl,
        apiKey: options.config.apiKey,
        fetch: fetch_,
        paymentProfile: agent.paymentProfile,
        ...(signer ? { signer } : {}),
      });

  let resourceClosePromise: Promise<void> | undefined;
  const closeResources = () => {
    resourceClosePromise ??= (async () => {
      if (signer) await signer.flushPaymentObservations();
      if (upstreamConnection) await upstreamConnection.close();
    })();
    return resourceClosePromise;
  };
  const closeServerResources = server.onclose;
  server.onclose = () => {
    closeServerResources?.();
    void closeResources();
  };

  const transport = new StdioServerTransport(options.stdin, options.stdout);
  try {
    await server.connect(transport);
  } catch (error) {
    await closeResources();
    throw error;
  }

  let closePromise: Promise<void> | undefined;
  return {
    close() {
      closePromise ??= (async () => {
        await server.close();
        await closeResources();
      })();
      return closePromise;
    },
  };
}
