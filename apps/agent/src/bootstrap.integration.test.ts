import { createServer } from "node:http";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectLeashAgent, LeashConnectError } from "./bootstrap.js";

const apiKey = `agent_sk_${"b".repeat(43)}`;

describe("agent control-plane bootstrap over HTTP", () => {
  const requests: Array<{ authorization: string | undefined; body: unknown; method: string }> = [];
  let responseBody: unknown = {
    agent: { address: null },
    client: { name: "Unknown client" },
    paymentProfile: "mainnet",
  };
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
    responseBody = {
      agent: { address: null },
      client: { name: "Unknown client" },
      paymentProfile: "mainnet",
    };

    await expect(
      connectLeashAgent({ apiBaseUrl: origin, apiKey, fetch: globalThis.fetch }),
    ).resolves.toEqual({ address: null, paymentProfile: "mainnet" });
    expect(requests).toEqual([
      {
        authorization: `Bearer ${apiKey}`,
        body: { transport: "mcp" },
        method: "POST",
      },
    ]);
  });

  it("forbids redirects on the authenticated bootstrap request", async () => {
    const fetch = async (_input: Request | string | URL, init?: RequestInit) => {
      expect(init?.redirect).toBe("error");
      throw new TypeError("redirect blocked");
    };

    await expect(connectLeashAgent({ apiBaseUrl: origin, apiKey, fetch })).rejects.toMatchObject({
      code: "CONNECT_FAILED",
      status: 503,
    });
  });

  it("cancels a chunked response as soon as it exceeds the byte bound", async () => {
    const totalChunks = 16;
    let cancelled = false;
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
      pull(controller) {
        pulls += 1;
        if (pulls > totalChunks) {
          controller.close();
          return;
        }
        controller.enqueue(new Uint8Array(16_384));
      },
    });
    const fetch = async () =>
      new Response(body, { headers: { "content-type": "application/json" } });

    await expect(connectLeashAgent({ apiBaseUrl: origin, apiKey, fetch })).rejects.toMatchObject({
      code: "INVALID_CONNECT_RESPONSE",
      message: "The agent control plane returned an invalid response.",
      status: 502,
    });
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThan(totalChunks);
  });

  it("accepts only a null or EVM address from the control plane", async () => {
    const address = "0x2222222222222222222222222222222222222222";
    responseBody = { agent: { address }, paymentProfile: "base_sepolia_integration" };
    await expect(
      connectLeashAgent({ apiBaseUrl: origin, apiKey, fetch: globalThis.fetch }),
    ).resolves.toEqual({ address, paymentProfile: "base_sepolia_integration" });

    responseBody = { agent: { address: "not-an-address" }, paymentProfile: "mainnet" };
    await expect(
      connectLeashAgent({ apiBaseUrl: origin, apiKey, fetch: globalThis.fetch }),
    ).rejects.toThrow(LeashConnectError);
  });

  it("fails closed when the payment profile is missing or unknown", async () => {
    status = 200;
    for (const response of [
      { agent: { address: null } },
      { agent: { address: null }, paymentProfile: "base_sepolia" },
    ]) {
      responseBody = response;
      await expect(
        connectLeashAgent({ apiBaseUrl: origin, apiKey, fetch: globalThis.fetch }),
      ).rejects.toMatchObject({ code: "INVALID_CONNECT_RESPONSE", status: 502 });
    }
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
