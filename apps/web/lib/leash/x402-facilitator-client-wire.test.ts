import { afterEach, describe, expect, it } from "vitest";

import { HardenedHTTPFacilitatorClient } from "./x402-facilitator-client";
import {
  json,
  localFacilitator,
  payee,
  payer,
  payload,
  readRequestJson,
  requirements,
} from "./x402-facilitator-client.test-support";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe("hardened x402 facilitator HTTP wire", () => {
  it("preserves the installed verify, settle, and supported wire contracts", async () => {
    const requests: Array<{ body: unknown; method: string; url: string }> = [];
    const server = await localFacilitator(async (request, response) => {
      requests.push({
        body: request.method === "GET" ? undefined : await readRequestJson(request),
        method: request.method ?? "",
        url: request.url ?? "",
      });
      if (request.url === "/facilitator/verify") {
        return json(response, { isValid: true, payer });
      }
      if (request.url === "/facilitator/settle") {
        return json(response, {
          amount: "1000",
          network: "eip155:84532",
          payer,
          success: true,
          transaction: `0x${"ab".repeat(32)}`,
        });
      }
      return json(response, {
        kinds: [{ network: "eip155:84532", scheme: "exact", x402Version: 2 }],
      });
    });
    cleanups.push(server.close);
    const client = new HardenedHTTPFacilitatorClient({ url: server.url });

    await expect(client.verify(payload, requirements)).resolves.toEqual({
      isValid: true,
      payer,
    });
    await expect(client.settle(payload, requirements)).resolves.toMatchObject({
      amount: "1000",
      success: true,
    });
    await expect(client.getSupported()).resolves.toEqual({
      extensions: [],
      kinds: [{ network: "eip155:84532", scheme: "exact", x402Version: 2 }],
      signers: {},
    });

    const expectedBody = {
      paymentPayload: payload,
      paymentRequirements: requirements,
      x402Version: 2,
    };
    expect(requests).toEqual([
      { body: expectedBody, method: "POST", url: "/facilitator/verify" },
      { body: expectedBody, method: "POST", url: "/facilitator/settle" },
      { body: undefined, method: "GET", url: "/facilitator/supported" },
    ]);
  });

  it("refuses an HTTP redirect without following it", async () => {
    let redirectedRequests = 0;
    const server = await localFacilitator((request, response) => {
      if (request.url === "/facilitator/verify") {
        response.writeHead(302, { location: `${server.url}/redirected` });
        response.end();
        return;
      }
      redirectedRequests += 1;
      json(response, { isValid: true, payer: payee });
    });
    cleanups.push(server.close);
    const client = new HardenedHTTPFacilitatorClient({ url: server.url });

    await expect(client.verify(payload, requirements)).rejects.toMatchObject({
      code: "X402_FACILITATOR_UNAVAILABLE",
      message: "The x402 facilitator is unavailable.",
    });
    expect(redirectedRequests).toBe(0);
  });

  it("aborts a facilitator that does not return response headers", async () => {
    const server = await localFacilitator(() => undefined);
    cleanups.push(server.close);
    const client = new HardenedHTTPFacilitatorClient({ timeoutMs: 20, url: server.url });

    await expect(client.verify(payload, requirements)).rejects.toMatchObject({
      code: "X402_FACILITATOR_TIMEOUT",
      message: "The x402 facilitator timed out.",
    });
  });
});
