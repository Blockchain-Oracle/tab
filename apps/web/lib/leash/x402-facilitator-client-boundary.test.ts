import { FacilitatorResponseError, SettleError, VerifyError } from "@x402/core/types";
import { describe, expect, it, vi } from "vitest";

import { HardenedHTTPFacilitatorClient } from "./x402-facilitator-client";
import { payload, requirements } from "./x402-facilitator-client.test-support";

function client(fetch: typeof globalThis.fetch, overrides: { maxResponseBytes?: number } = {}) {
  return new HardenedHTTPFacilitatorClient({
    fetch,
    maxResponseBytes: overrides.maxResponseBytes ?? 128,
    timeoutMs: 50,
    url: "https://x402.example.test/facilitator",
  });
}

describe("hardened x402 facilitator response boundary", () => {
  it("always sets redirect:error and an abort signal", async () => {
    const fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.redirect).toBe("error");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Response.json({ isValid: true });
    });

    await expect(client(fetch).verify(payload, requirements)).resolves.toMatchObject({
      isValid: true,
    });
  });

  it("bounds and sanitizes authentication-header generation", async () => {
    const secret = "facilitator-auth-secret";
    const fetch = vi.fn(async () => Response.json({ isValid: true }));
    const facilitator = new HardenedHTTPFacilitatorClient({
      createAuthHeaders: async () => {
        throw new Error(secret);
      },
      fetch,
      timeoutMs: 50,
      url: "https://x402.example.test/facilitator",
    });

    try {
      await facilitator.verify(payload, requirements);
      throw new Error("Expected authentication rejection.");
    } catch (error) {
      expect(error).toMatchObject({
        code: "X402_FACILITATOR_UNAVAILABLE",
        message: "The x402 facilitator is unavailable.",
      });
      expect((error as Error).message).not.toContain(secret);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared response without reading it", async () => {
    let cancelled = false;
    const body = new ReadableStream({
      cancel() {
        cancelled = true;
      },
    });
    const fetch = vi.fn(
      async () =>
        new Response(body, {
          headers: { "content-length": "999", "content-type": "application/json" },
        }),
    );

    await expect(client(fetch).verify(payload, requirements)).rejects.toMatchObject({
      code: "X402_FACILITATOR_RESPONSE_TOO_LARGE",
      message: "The x402 facilitator response exceeded the allowed size.",
    });
    expect(cancelled).toBe(true);
  });

  it("stops an undeclared streamed response at the byte bound", async () => {
    let cancelled = false;
    const body = new ReadableStream({
      cancel() {
        cancelled = true;
      },
      start(controller) {
        controller.enqueue(new Uint8Array(129));
      },
    });
    const fetch = vi.fn(async () => new Response(body));

    await expect(client(fetch).verify(payload, requirements)).rejects.toMatchObject({
      code: "X402_FACILITATOR_RESPONSE_TOO_LARGE",
    });
    expect(cancelled).toBe(true);
  });

  it("applies the same timeout while reading an unfinished response stream", async () => {
    let cancelled = false;
    const body = new ReadableStream({
      cancel() {
        cancelled = true;
      },
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"isValid":'));
      },
    });
    const facilitator = new HardenedHTTPFacilitatorClient({
      fetch: async () => new Response(body),
      timeoutMs: 10,
      url: "https://x402.example.test/facilitator",
    });

    await expect(facilitator.verify(payload, requirements)).rejects.toMatchObject({
      code: "X402_FACILITATOR_TIMEOUT",
    });
    expect(cancelled).toBe(true);
  });

  it("never forwards transport or malformed-response secrets through errors", async () => {
    const transportSecret = "authorization-secret-from-fetch";
    const responseSecret = "payment-signature-secret-from-response";
    const unavailable = client(async () => {
      throw new Error(transportSecret);
    });
    const malformed = client(async () => Response.json({ leaked: responseSecret }));

    await expect(unavailable.verify(payload, requirements)).rejects.not.toThrow(transportSecret);
    try {
      await malformed.verify(payload, requirements);
      throw new Error("Expected malformed response rejection.");
    } catch (error) {
      expect(error).toBeInstanceOf(FacilitatorResponseError);
      expect((error as Error).message).not.toContain(responseSecret);
    }
  });

  it("keeps installed typed rejection errors but strips provider-controlled messages", async () => {
    const secret = "payment-signature-secret";
    const verifyClient = client(
      async () =>
        Response.json(
          { invalidMessage: secret, invalidReason: "invalid_signature", isValid: false },
          { status: 400 },
        ),
      { maxResponseBytes: 512 },
    );
    const settleClient = client(
      async () =>
        Response.json(
          {
            errorMessage: secret,
            errorReason: "settlement_failed",
            network: "eip155:84532",
            success: false,
            transaction: "",
          },
          { status: 400 },
        ),
      { maxResponseBytes: 512 },
    );

    try {
      await verifyClient.verify(payload, requirements);
      throw new Error("Expected verification rejection.");
    } catch (error) {
      expect(error).toBeInstanceOf(VerifyError);
      expect(error).toMatchObject({ invalidReason: "invalid_signature", statusCode: 400 });
      expect((error as Error).message).not.toContain(secret);
    }
    try {
      await settleClient.settle(payload, requirements);
      throw new Error("Expected settlement rejection.");
    } catch (error) {
      expect(error).toBeInstanceOf(SettleError);
      expect(error).toMatchObject({ errorReason: "settlement_failed", statusCode: 400 });
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it("retries a bounded supported 429 using the installed retry contract", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({}, { headers: { "retry-after": "0" }, status: 429 }))
      .mockResolvedValueOnce(Response.json({ kinds: [] }));
    const sleep = vi.fn(async () => undefined);
    const supportedClient = new HardenedHTTPFacilitatorClient({
      fetch,
      sleep,
      url: "https://x402.example.test/facilitator",
    });

    await expect(supportedClient.getSupported()).resolves.toEqual({
      extensions: [],
      kinds: [],
      signers: {},
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1_000);
  });
});
