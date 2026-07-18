import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MAX_SIGN_REQUEST_BYTES,
  readSignRequestBody,
  SIGN_REQUEST_BODY_TIMEOUT_MS,
  SignRequestBodyError,
} from "./sign-request-body";

function request() {
  return new NextRequest("http://localhost/api/agent/sign", {
    body: "{}",
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

function installReader(
  target: NextRequest,
  reader: {
    cancel: () => Promise<unknown>;
    read: () => Promise<ReadableStreamReadResult<Uint8Array>>;
    releaseLock: () => void;
  },
) {
  const bodyCancel = vi.fn(async () => undefined);
  const getReader = vi.fn(() => reader);
  Object.defineProperty(target, "body", {
    configurable: true,
    value: { cancel: bodyCancel, getReader },
  });
  return { bodyCancel, getReader };
}

afterEach(() => vi.useRealTimers());

describe("sign request body ingestion", () => {
  it("keeps the 64 KiB byte cap and cancels overflow without masking the invalid request", async () => {
    let reads = 0;
    const cancel = vi.fn(async () => {
      throw new Error("transport cancellation failed");
    });
    const releaseLock = vi.fn();
    const target = request();
    installReader(target, {
      cancel,
      read: async () => {
        reads += 1;
        return {
          done: false,
          value: new Uint8Array(reads === 1 ? MAX_SIGN_REQUEST_BYTES : 1),
        };
      },
      releaseLock,
    });

    await expect(readSignRequestBody(target)).rejects.toBeInstanceOf(SignRequestBodyError);
    expect(MAX_SIGN_REQUEST_BYTES).toBe(64 * 1_024);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(reads).toBe(2);
  });

  it.each([
    "65537",
    "invalid",
  ])("cancels an unread body rejected by declared Content-Length %s", async (contentLength) => {
    const target = request();
    const cancel = vi.fn(async () => undefined);
    const getReader = vi.fn(() => {
      throw new Error("Rejected bodies must not be read");
    });
    target.headers.set("content-length", contentLength);
    Object.defineProperty(target, "body", {
      configurable: true,
      value: { cancel, getReader },
    });

    await expect(readSignRequestBody(target)).rejects.toBeInstanceOf(SignRequestBodyError);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(getReader).not.toHaveBeenCalled();
  });

  it("uses one total deadline for a never-resolving body read", async () => {
    vi.useFakeTimers();
    const target = request();
    const cancel = vi.fn(async () => undefined);
    const releaseLock = vi.fn();
    installReader(target, {
      cancel,
      read: vi.fn(() => new Promise<never>(() => undefined)),
      releaseLock,
    });

    const pending = readSignRequestBody(target, { timeoutMs: 5 });
    const rejected = expect(pending).rejects.toBeInstanceOf(SignRequestBodyError);
    await vi.advanceTimersByTimeAsync(5);
    await rejected;
    expect(SIGN_REQUEST_BODY_TIMEOUT_MS).toBe(5_000);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });

  it("does not reset the total deadline after each chunk", async () => {
    vi.useFakeTimers();
    const target = request();
    const cancel = vi.fn(async () => undefined);
    const releaseLock = vi.fn();
    const read = vi.fn(
      () =>
        new Promise<ReadableStreamReadResult<Uint8Array>>((resolve) => {
          setTimeout(() => resolve({ done: false, value: new Uint8Array([32]) }), 3);
        }),
    );
    installReader(target, { cancel, read, releaseLock });

    const pending = readSignRequestBody(target, { timeoutMs: 5 });
    const rejected = expect(pending).rejects.toBeInstanceOf(SignRequestBodyError);
    await vi.advanceTimersByTimeAsync(3);
    expect(read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2);
    await rejected;
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("rejects an already-aborted request without taking a reader", async () => {
    const target = request();
    const cancel = vi.fn(async () => undefined);
    const getReader = vi.fn(() => {
      throw new Error("An aborted body must not be read");
    });
    Object.defineProperties(target, {
      body: { configurable: true, value: { cancel, getReader } },
      signal: { configurable: true, value: AbortSignal.abort() },
    });

    await expect(readSignRequestBody(target)).rejects.toBeInstanceOf(SignRequestBodyError);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(getReader).not.toHaveBeenCalled();
  });

  it("cancels an in-flight read when the request aborts", async () => {
    const target = request();
    const controller = new AbortController();
    const cancel = vi.fn(async () => undefined);
    const releaseLock = vi.fn();
    installReader(target, {
      cancel,
      read: vi.fn(() => new Promise<never>(() => undefined)),
      releaseLock,
    });
    Object.defineProperty(target, "signal", { configurable: true, value: controller.signal });

    const pending = readSignRequestBody(target);
    const rejected = expect(pending).rejects.toBeInstanceOf(SignRequestBodyError);
    controller.abort();
    await rejected;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });
});
