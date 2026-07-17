import type { Readable, Writable } from "node:stream";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { connectLeashAgent } from "./bootstrap.js";
import type { LeashCliConfig } from "./cli-config.js";
import { createPaidFetchServer } from "./paid-fetch-server.js";
import { createLeashPaymentClient } from "./payment-client.js";
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
  let upstream: Awaited<ReturnType<typeof connectStreamableHttpUpstream>> | undefined;
  if (options.config.upstreamUrl) {
    upstream = await connectStreamableHttpUpstream(options.config.upstreamUrl, fetch_);
    if (agent.address) {
      signer = new LeashRemoteSigner({
        address: agent.address,
        apiBaseUrl: options.config.apiBaseUrl,
        apiKey: options.config.apiKey,
        fetch: fetch_,
      });
    }
  }

  const server = upstream
    ? createLeashProxyServer({
        ...(signer ? { paymentClient: createLeashPaymentClient(signer) } : {}),
        upstream,
      })
    : createPaidFetchServer({
        address: agent.address,
        apiBaseUrl: options.config.apiBaseUrl,
        apiKey: options.config.apiKey,
        fetch: fetch_,
      });

  let resourceClosePromise: Promise<void> | undefined;
  const closeResources = () => {
    resourceClosePromise ??= (async () => {
      if (signer) await signer.flushPaymentObservations();
      if (upstream) await upstream.close();
    })();
    return resourceClosePromise;
  };
  server.onclose = () => {
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
