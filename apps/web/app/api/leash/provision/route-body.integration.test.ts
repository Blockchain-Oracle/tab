import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Database } from "../../../../lib/db/client";
import { createRevokeRouteHarness } from "../revoke/route-test-support";
import { handleProvisionRequest, PROVISION_BODY_READ_TIMEOUT_MS } from "./route";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for provision body tests");
const harness = createRevokeRouteHarness(databaseUrl);
const agentAddress = "0x2222222222222222222222222222222222222222";

beforeEach(async () => harness.reset());
afterAll(async () => harness.close());

function handle(
  request: ReturnType<typeof harness.request>,
  getOrCreateWallet: (subject: string) => Promise<string> = async () => agentAddress,
) {
  return handleProvisionRequest(request, {
    client: { getOrCreateWallet },
    database: harness.connection.db,
    paymentProfile: "mainnet",
  });
}

function timeoutDependencies(
  getOrCreateWallet: (subject: string) => Promise<string>,
  transaction: ReturnType<typeof vi.fn>,
) {
  return {
    bodyReadTimeoutMs: 5,
    client: { getOrCreateWallet },
    database: { transaction } as unknown as Database,
    paymentProfile: "mainnet" as const,
  };
}

async function withTestGuard<T>(promise: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<"test-guard">((resolve) => {
    timer = setTimeout(() => resolve("test-guard"), 100);
  });
  try {
    return await Promise.race([promise, guard]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

describe("POST /api/leash/provision body bounds", () => {
  it("bounds a streamed request without relying on Content-Length", async () => {
    const owner = await harness.provision("provision-stream-limit");
    const wallet = vi.fn(async (_subject: string) => agentAddress);
    const request = harness.request({}, owner.token);
    let pulls = 0;
    const cancel = vi.fn(async () => undefined);
    const releaseLock = vi.fn();
    Object.defineProperty(request, "body", {
      configurable: true,
      value: {
        getReader: () => ({
          cancel,
          read: async () => {
            pulls += 1;
            if (pulls === 1) {
              return { done: false, value: new TextEncoder().encode(" ".repeat(2_048)) };
            }
            if (pulls === 2) return { done: false, value: new Uint8Array([32]) };
            throw new Error("The route read beyond its byte limit");
          },
          releaseLock,
        }),
      },
    });

    expect(request.headers.get("content-length")).toBeNull();
    const response = await handle(request, wallet);
    expect(response.status).toBe(400);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(pulls).toBe(2);
    expect(wallet).not.toHaveBeenCalled();
  });

  it.each([
    "2049",
    "not-a-number",
  ])("best-effort cancels a body rejected by declared Content-Length %s", async (contentLength) => {
    const owner = await harness.provision(`provision-declared-${contentLength}`);
    const wallet = vi.fn(async (_subject: string) => agentAddress);
    const request = harness.request({}, owner.token);
    const cancel = vi.fn(async () => undefined);
    const getReader = vi.fn(() => {
      throw new Error("A rejected body must not be read");
    });
    request.headers.set("content-length", contentLength);
    Object.defineProperty(request, "body", {
      configurable: true,
      value: { cancel, getReader },
    });

    const response = await handle(request, wallet);
    expect(response.status).toBe(400);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(getReader).not.toHaveBeenCalled();
    expect(wallet).not.toHaveBeenCalled();
  });

  it("keeps an overflow invalid when request-stream cancellation rejects", async () => {
    const owner = await harness.provision("provision-cancel-rejection");
    const wallet = vi.fn(async (_subject: string) => agentAddress);
    const request = harness.request({}, owner.token);
    let pulls = 0;
    const cancel = vi.fn(async () => {
      throw new Error("transport cancellation failed");
    });
    const releaseLock = vi.fn();
    Object.defineProperty(request, "body", {
      configurable: true,
      value: {
        getReader: () => ({
          cancel,
          read: async () => {
            pulls += 1;
            return { done: false, value: new Uint8Array(pulls === 1 ? 2_048 : 1) };
          },
          releaseLock,
        }),
      },
    });

    const response = await handle(request, wallet);
    expect(response.status).toBe(400);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(pulls).toBe(2);
    expect(wallet).not.toHaveBeenCalled();
  });

  it("times out a never-resolving body read before provisioning", async () => {
    expect(PROVISION_BODY_READ_TIMEOUT_MS).toBe(5_000);
    const owner = await harness.provision("provision-stalled-body");
    const request = harness.request({}, owner.token);
    const wallet = vi.fn(async (_subject: string) => agentAddress);
    const transaction = vi.fn(() => {
      throw new Error("Provisioning storage must not run");
    });
    const cancel = vi.fn(async () => undefined);
    const releaseLock = vi.fn();
    const read = vi.fn(() => new Promise<never>(() => undefined));
    Object.defineProperty(request, "body", {
      configurable: true,
      value: { getReader: () => ({ cancel, read, releaseLock }) },
    });

    const outcome = await withTestGuard(
      handleProvisionRequest(request, timeoutDependencies(wallet, transaction)),
    );
    expect(outcome).not.toBe("test-guard");
    if (outcome === "test-guard") return;
    expect(outcome.status).toBe(408);
    await expect(outcome.json()).resolves.toMatchObject({
      error: { code: "PROVISION_REQUEST_TIMEOUT" },
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(transaction).not.toHaveBeenCalled();
    expect(wallet).not.toHaveBeenCalled();
  });

  it("rejects an already-aborted request before reading or provisioning", async () => {
    const owner = await harness.provision("provision-aborted-body");
    const request = harness.request({}, owner.token);
    const wallet = vi.fn(async (_subject: string) => agentAddress);
    const transaction = vi.fn(() => {
      throw new Error("Provisioning storage must not run");
    });
    const cancel = vi.fn(async () => undefined);
    const getReader = vi.fn(() => {
      throw new Error("An aborted body must not be read");
    });
    Object.defineProperties(request, {
      body: { configurable: true, value: { cancel, getReader } },
      signal: { configurable: true, value: AbortSignal.abort() },
    });

    const response = await handleProvisionRequest(
      request,
      timeoutDependencies(wallet, transaction),
    );
    expect(response.status).toBe(408);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PROVISION_REQUEST_TIMEOUT" },
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(getReader).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(wallet).not.toHaveBeenCalled();
  });

  it("accepts a valid chunked JSON body without Content-Length", async () => {
    const owner = await harness.provision("provision-stream-valid");
    const wallet = vi.fn(async (_subject: string) => agentAddress);
    const template = harness.request({}, owner.token);
    const encoded = new TextEncoder().encode(JSON.stringify({ name: "Chunked agent" }));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded.subarray(0, 8));
        controller.enqueue(encoded.subarray(8));
        controller.close();
      },
    });
    const request = new NextRequest(
      new Request(template.url, {
        body: stream,
        duplex: "half",
        headers: template.headers,
        method: "POST",
      } as RequestInit & { duplex: "half" }),
    );

    expect(request.headers.get("content-length")).toBeNull();
    const response = await handle(request, wallet);
    expect(response.status).toBe(200);
    expect(wallet).toHaveBeenCalledTimes(1);
  });
});
