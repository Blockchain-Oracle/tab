import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { createPinnedPaymentFetch, type PaymentTargetLookup } from "./payment-target-network.js";
import { TAB_MCP_VERSION } from "./version.js";

export async function connectStreamableHttpUpstream(
  endpoint: string,
  options: {
    allowDevelopmentLoopback?: boolean;
    fetch?: typeof globalThis.fetch;
    lookup?: PaymentTargetLookup;
  } = {},
) {
  const client = new Client({ name: "tab-mcp-upstream", version: TAB_MCP_VERSION });
  const policy = createPinnedPaymentFetch({
    allowDevelopmentLoopback: options.allowDevelopmentLoopback === true,
    fetch: options.fetch ?? globalThis.fetch,
    ...(options.lookup ? { lookup: options.lookup } : {}),
  });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    fetch: policy.fetch,
  });
  try {
    // SDK 1.29's exact-optional transport declarations are structurally incompatible.
    await client.connect(transport as Transport);
    let closePromise: Promise<void> | undefined;
    return {
      client,
      close() {
        closePromise ??= (async () => {
          try {
            await client.close();
          } finally {
            await policy.close();
          }
        })();
        return closePromise;
      },
    };
  } catch (error) {
    await transport.close().catch(() => undefined);
    await policy.close().catch(() => undefined);
    throw error;
  }
}
