import { createServer } from "node:http";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectLeashAgent, LeashConnectError } from "./bootstrap.js";

const apiKey = `leash_sk_${"b".repeat(43)}`;

describe("Leash control-plane bootstrap over HTTP", () => {
  const requests: Array<{ authorization: string | undefined; body: unknown; method: string }> = [];
  let responseBody: unknown = { agent: { address: null }, client: { name: "Unknown client" } };
  let status = 200;
  let origin = "";
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({
      authorization: request.headers.authorization,
      body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
      method: request.method ?? "",
    });
    response.statusCode = status;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(responseBody));
  });

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP listener");
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("authenticates and omits unknown clientInfo from the initial connect", async () => {
    requests.length = 0;
    status = 200;
    responseBody = { agent: { address: null }, client: { name: "Unknown client" } };

    await expect(
      connectLeashAgent({ apiBaseUrl: origin, apiKey, fetch: globalThis.fetch }),
    ).resolves.toEqual({ address: null });
    expect(requests).toEqual([
      {
        authorization: `Bearer ${apiKey}`,
        body: { transport: "mcp" },
        method: "POST",
      },
    ]);
  });

  it("accepts only a null or EVM address from the control plane", async () => {
    const address = "0x2222222222222222222222222222222222222222";
    responseBody = { agent: { address } };
    await expect(
      connectLeashAgent({ apiBaseUrl: origin, apiKey, fetch: globalThis.fetch }),
    ).resolves.toEqual({ address });

    responseBody = { agent: { address: "not-an-address" } };
    await expect(
      connectLeashAgent({ apiBaseUrl: origin, apiKey, fetch: globalThis.fetch }),
    ).rejects.toThrow(LeashConnectError);
  });

  it("fails closed on a rejected or malformed response", async () => {
    status = 401;
    responseBody = { error: { code: "UNAUTHORIZED", message: "Authentication is required." } };
    await expect(
      connectLeashAgent({ apiBaseUrl: origin, apiKey, fetch: globalThis.fetch }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });

    status = 200;
    responseBody = { agent: {} };
    await expect(
      connectLeashAgent({ apiBaseUrl: origin, apiKey, fetch: globalThis.fetch }),
    ).rejects.toMatchObject({ code: "INVALID_CONNECT_RESPONSE", status: 502 });
  });
});
