import { describe, expect, it, vi } from "vitest";

import { TabRemoteSigner } from "./remote-signer.js";
import {
  account,
  nowSeconds,
  paymentContext,
  signWith,
  validSignerRequest,
} from "./remote-signer.test-support.js";

function signerWithBoundary(fetch: typeof globalThis.fetch, signTimeoutMs = 50) {
  return new TabRemoteSigner({
    address: account.address,
    apiBaseUrl: "https://tab.example.test/",
    apiKey: "agent_sk_secret",
    fetch,
    nowSeconds: () => nowSeconds,
    paymentProfile: "mainnet",
    signTimeoutMs,
  });
}

describe("Agent remote signer HTTP boundary", () => {
  it("rejects a remote cleartext control-plane origin before sending the API key", () => {
    const fetch = vi.fn(async () => Response.json({}));
    expect(
      () =>
        new TabRemoteSigner({
          address: account.address,
          apiBaseUrl: "http://tab.example.test",
          apiKey: "agent_sk_secret",
          fetch,
          paymentProfile: "mainnet",
        }),
    ).toThrow("The agent control-plane origin is invalid.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("forbids redirects on an authenticated signing request", async () => {
    const fetch = vi.fn(async (_input: Request | string | URL, init?: RequestInit) => {
      expect(init?.redirect).toBe("error");
      throw new TypeError("redirect blocked");
    });

    await expect(
      signerWithBoundary(fetch).signTypedData(validSignerRequest()),
    ).rejects.toMatchObject({ code: "SIGNER_REQUEST_UNAVAILABLE", status: 503 });
  });

  it("aborts and bounds a sign request that never returns", async () => {
    let aborted = false;
    const fetch = vi.fn(
      async (_input: Request | string | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          expect(init?.signal).toBeInstanceOf(AbortSignal);
          init?.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(init.signal?.reason);
          });
        }),
    );

    await expect(
      signerWithBoundary(fetch, 10).signTypedData(validSignerRequest()),
    ).rejects.toMatchObject({
      code: "SIGNER_REQUEST_TIMEOUT",
      message: "The agent control plane timed out.",
      status: 504,
    });
    expect(aborted).toBe(true);
  });

  it("turns a transport failure into a secret-safe unavailable error", async () => {
    const signer = signerWithBoundary(async () => {
      throw new Error("agent_sk_secret leaked by https://internal.example.test");
    });

    await expect(signer.signTypedData(validSignerRequest())).rejects.toMatchObject({
      code: "SIGNER_REQUEST_UNAVAILABLE",
      message: "The agent control plane could not be reached.",
      status: 503,
    });
  });

  it("rejects an oversized declared response without reading its body", async () => {
    let cancelled = false;
    const body = new ReadableStream({
      cancel() {
        cancelled = true;
      },
    });
    const signer = signerWithBoundary(
      async () =>
        new Response(body, {
          headers: { "content-length": "999999", "content-type": "application/json" },
        }),
    );

    await expect(signer.signTypedData(validSignerRequest())).rejects.toMatchObject({
      code: "INVALID_SIGNER_RESPONSE",
      message: "The signer response is invalid.",
      status: 502,
    });
    expect(cancelled).toBe(true);
  });

  it("stops reading a streamed response once the byte bound is exceeded", async () => {
    let cancelled = false;
    const body = new ReadableStream({
      cancel() {
        cancelled = true;
      },
      start(controller) {
        controller.enqueue(new Uint8Array(70_000));
      },
    });
    const signer = signerWithBoundary(
      async () => new Response(body, { headers: { "content-type": "application/json" } }),
    );

    await expect(signer.signTypedData(validSignerRequest())).rejects.toMatchObject({
      code: "INVALID_SIGNER_RESPONSE",
      status: 502,
    });
    expect(cancelled).toBe(true);
  });

  it("rejects a JSON-shaped body with a non-JSON content type", async () => {
    let cancelled = false;
    const body = new ReadableStream({
      cancel() {
        cancelled = true;
      },
    });
    const signer = signerWithBoundary(
      async () =>
        new Response(body, {
          headers: { "content-type": "text/plain" },
          status: 503,
        }),
    );

    await expect(signer.signTypedData(validSignerRequest())).rejects.toMatchObject({
      code: "INVALID_SIGNER_RESPONSE",
      status: 502,
    });
    expect(cancelled).toBe(true);
  });

  it.each([
    ["SIGNER_NOT_CONFIGURED", 503],
    ["SIGNER_PROVIDER_REJECTED", 502],
    ["SIGNER_PROVIDER_UNAVAILABLE", 503],
    ["SIGNER_PROVIDER_TIMEOUT", 504],
    ["SIGNER_PROVIDER_RATE_LIMITED", 429],
    ["SIGN_REQUEST_IN_PROGRESS", 409],
    ["SIGN_REQUEST_RECONCILING", 409],
    ["SIGN_RATE_LIMITED", 429],
    ["SIGNER_IDENTITY_MISMATCH", 502],
  ])("preserves the safe %s server code without preserving its message", async (code, status) => {
    const signer = signerWithBoundary(
      async () =>
        new Response(
          JSON.stringify({
            error: { code, message: "agent_sk_secret and provider internals must not escape" },
          }),
          { headers: { "content-type": "application/problem+json" }, status },
        ),
    );

    try {
      await signer.signTypedData(validSignerRequest());
      throw new Error("Expected the sign request to fail");
    } catch (error) {
      expect(error).toMatchObject({ code, status });
      expect((error as Error).message).not.toContain("agent_sk_secret");
      expect((error as Error).message).not.toContain("provider internals");
    }
  });

  it("does not reflect an unknown server code or message", async () => {
    const signer = signerWithBoundary(async () =>
      Response.json(
        { error: { code: "SECRET_DATABASE_FAILURE", message: "postgres://secret" } },
        { status: 500 },
      ),
    );

    await expect(signer.signTypedData(validSignerRequest())).rejects.toMatchObject({
      code: "SIGNER_REQUEST_FAILED",
      message: "The signer request failed.",
      status: 500,
    });
  });

  it.each([
    [
      "oversized",
      () =>
        new Response(
          `${" ".repeat(70_000)}${JSON.stringify({
            receiptId: "receipt-boundary",
            status: "settled",
            verified: true,
          })}`,
          { headers: { "content-type": "application/json" } },
        ),
    ],
    [
      "non-JSON",
      () =>
        new Response(
          JSON.stringify({
            receiptId: "receipt-boundary",
            status: "settled",
            verified: true,
          }),
          { headers: { "content-type": "text/plain" } },
        ),
    ],
  ])("does not trust an %s settlement acknowledgement", async (_label, acknowledgement) => {
    const request = validSignerRequest();
    const signature = await signWith(account, request);
    const signer = signerWithBoundary(async (input) =>
      new URL(input.toString()).pathname === "/api/agent/sign"
        ? Response.json({ receiptId: "receipt-boundary", signature })
        : acknowledgement(),
    );
    await signer.signTypedData(request);

    await signer.reportPaymentObservation(paymentContext(signature));
    await signer.flushPaymentObservations();

    expect(signer.receiptIdForSignature(signature)).toBe("receipt-boundary");
  });
});
