import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export async function connectStreamableHttpUpstream(
  endpoint: string,
  fetch: typeof globalThis.fetch = globalThis.fetch,
) {
  const client = new Client({ name: "leash-mcp-upstream", version: "0.0.1" });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), { fetch });
  try {
    // SDK 1.29's exact-optional transport declarations are structurally incompatible.
    await client.connect(transport as Transport);
    return client;
  } catch (error) {
    await transport.close().catch(() => undefined);
    throw error;
  }
}
