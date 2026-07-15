import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { sendWebhookHttpRequest, WebhookHttpClientError } from "./http-client";

const servers: ReturnType<typeof createServer>[] = [];
const localTestRequest = { allowLocalHttp: true, environment: "test" as const };

async function localServer(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
});

describe("real outbound webhook HTTP", () => {
  it("posts exact UTF-8 bytes and caller headers with an explicit content length", async () => {
    let receive: (value: { body: Buffer; headers: IncomingMessage["headers"] }) => void;
    const received = new Promise<{ body: Buffer; headers: IncomingMessage["headers"] }>(
      (resolve) => {
        receive = resolve;
      },
    );
    const endpoint = await localServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        receive({ body: Buffer.concat(chunks), headers: request.headers });
        response.writeHead(204).end();
      });
    });
    const body = '{"event":"paid","note":"café 💸"}';

    const result = await sendWebhookHttpRequest({
      ...localTestRequest,
      body,
      endpointUrl: `${endpoint}/hook?delivery=one`,
      headers: { "content-type": "application/json", "x-tab-signature": "v1=signed" },
    });

    const request = await received;
    expect(request.body).toEqual(Buffer.from(body, "utf8"));
    expect(request.headers["content-length"]).toBe(String(Buffer.byteLength(body)));
    expect(request.headers["content-type"]).toBe("application/json");
    expect(request.headers.host).toBe(new URL(endpoint).host);
    expect(request.headers["x-tab-signature"]).toBe("v1=signed");
    expect(result.statusCode).toBe(204);
    expect(result.responseSnippet).toBe("");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns only the first 500 response characters while draining a 500 response", async () => {
    const endpoint = await localServer((_request, response) => {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(`reason:\0${"🙂".repeat(10_000)}`);
    });

    const result = await sendWebhookHttpRequest({
      ...localTestRequest,
      body: "{}",
      endpointUrl: `${endpoint}/failure`,
      headers: { "content-type": "application/json" },
    });

    expect(result.statusCode).toBe(500);
    expect(Array.from(result.responseSnippet)).toHaveLength(500);
    expect(result.responseSnippet.startsWith("reason:�")).toBe(true);
    expect(result.responseSnippet).not.toContain("\0");
  });

  it("returns a redirect response without requesting its Location", async () => {
    let redirectedRequests = 0;
    const target = await localServer((_request, response) => {
      redirectedRequests += 1;
      response.writeHead(204).end();
    });
    const endpoint = await localServer((_request, response) => {
      response.writeHead(302, { location: `${target}/must-not-run` }).end("moved");
    });

    const result = await sendWebhookHttpRequest({
      ...localTestRequest,
      body: "{}",
      endpointUrl: `${endpoint}/redirect`,
      headers: {},
    });

    expect(result.statusCode).toBe(302);
    expect(result.responseSnippet).toBe("moved");
    expect(redirectedRequests).toBe(0);
  });

  it("aborts a real socket when the full operation times out", async () => {
    const endpoint = await localServer(() => undefined);

    await expect(
      sendWebhookHttpRequest({
        ...localTestRequest,
        body: "{}",
        endpointUrl: `${endpoint}/hang`,
        headers: {},
        timeoutMs: 40,
      }),
    ).rejects.toMatchObject({ kind: "timeout" });
  });

  it("rejects live loopback before connecting and redacts endpoint details", async () => {
    let connections = 0;
    const endpoint = await localServer((_request, response) => {
      response.writeHead(204).end();
    });
    servers[servers.length - 1]?.on("connection", () => {
      connections += 1;
    });
    let caught: unknown;

    try {
      await sendWebhookHttpRequest({
        body: "{}",
        endpointUrl: `${endpoint.replace("http:", "https:")}/hook?token=never-log-me`,
        environment: "live",
        headers: { authorization: "also-never-log-me" },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(WebhookHttpClientError);
    expect(caught).toMatchObject({ kind: "config" });
    expect(String(caught)).not.toContain("never-log-me");
    expect(connections).toBe(0);
  });

  it("distinguishes a real connection refusal from configuration and timeout errors", async () => {
    const endpoint = await localServer((_request, response) => response.end());
    const server = servers.pop();
    await new Promise<void>((resolve, reject) =>
      server?.close((error) => (error ? reject(error) : resolve())),
    );

    const failure = await sendWebhookHttpRequest({
      ...localTestRequest,
      body: "{}",
      endpointUrl: `${endpoint}/closed?token=never-log-network`,
      headers: {},
    }).catch((error: unknown) => error);

    expect(failure).toMatchObject({ kind: "network" });
    expect(String(failure)).not.toContain("never-log-network");
  });

  it.each([
    "http://127.1:9/hook",
    "http://2130706433:9/hook",
  ])("rejects non-explicit test loopback spelling %s as configuration", async (endpointUrl) => {
    await expect(
      sendWebhookHttpRequest({ ...localTestRequest, body: "{}", endpointUrl, headers: {} }),
    ).rejects.toMatchObject({ kind: "config" });
  });

  it("resolves once and connects only through the validated pinned address", async () => {
    const endpoint = await localServer((_request, response) => response.writeHead(204).end());
    let resolutions = 0;
    const resolver = async () => {
      resolutions += 1;
      return [{ address: "127.0.0.1", family: 4 as const }];
    };

    const result = await sendWebhookHttpRequest(
      {
        ...localTestRequest,
        body: "{}",
        endpointUrl: `${endpoint.replace("127.0.0.1", "localhost")}/pinned`,
        headers: {},
      },
      resolver,
    );

    expect(result.statusCode).toBe(204);
    expect(resolutions).toBe(1);
  });
});
