import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const manifestUrl = new URL("../../public/mobile/manifest.webmanifest", import.meta.url);
const workerUrl = new URL("../../public/mobile/sw.js", import.meta.url);

type WorkerListener = (event: Record<string, unknown>) => void;

type WorkerHarness = ReturnType<typeof createWorkerHarness>;

function createWorkerHarness(options?: { cachedResponse?: Response; networkResponse?: Response }) {
  const listeners = new Map<string, WorkerListener>();
  const cache = {
    match: vi.fn().mockResolvedValue(options?.cachedResponse),
    put: vi.fn().mockResolvedValue(undefined),
  };
  const caches = {
    delete: vi.fn().mockResolvedValue(true),
    keys: vi.fn().mockResolvedValue(["tab-mobile-shell-v0", "unrelated-v1"]),
    open: vi.fn().mockResolvedValue(cache),
  };
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const networkFetch = vi
    .fn()
    .mockResolvedValue(
      options?.networkResponse ??
        new Response("public", { headers: { "cache-control": "public, max-age=31536000" } }),
    );
  const self = {
    addEventListener: (type: string, listener: WorkerListener) => listeners.set(type, listener),
    clients: {
      claim: vi.fn().mockResolvedValue(undefined),
      openWindow,
    },
    location: new URL("https://tab.example/mobile/sw.js"),
    skipWaiting: vi.fn().mockResolvedValue(undefined),
  };

  runInNewContext(readFileSync(workerUrl, "utf8"), {
    Headers,
    Request,
    Response,
    URL,
    caches,
    fetch: networkFetch,
    self,
  });

  return { cache, caches, listeners, networkFetch, openWindow };
}

function dispatchFetch(harness: WorkerHarness, request: Request) {
  let response: Promise<Response> | undefined;
  harness.listeners.get("fetch")?.({
    request,
    respondWith: (value: Promise<Response>) => {
      response = value;
    },
  });
  return response;
}

async function dispatchLifecycle(harness: WorkerHarness, type: "install" | "activate") {
  let work: Promise<unknown> | undefined;
  harness.listeners.get(type)?.({
    waitUntil: (value: Promise<unknown>) => {
      work = value;
    },
  });
  await work;
}

describe("mobile PWA public assets", () => {
  it("defines a same-origin install manifest rooted at /mobile", () => {
    const manifest = JSON.parse(readFileSync(manifestUrl, "utf8"));

    expect(manifest).toMatchObject({
      display: "standalone",
      id: "/mobile/",
      scope: "/mobile/",
      start_url: "/mobile/",
    });
    expect(manifest.name).toEqual(expect.any(String));
    expect(manifest.short_name).toEqual(expect.any(String));
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.icons).toContainEqual({
      purpose: "any",
      sizes: "any",
      src: "/mobile/icon-v1.svg",
      type: "image/svg+xml",
    });
    expect(
      readFileSync(new URL("../../public/mobile/icon-v1.svg", import.meta.url), "utf8"),
    ).toContain("<svg");
  });

  it("pre-caches only versioned public shell assets with credentials omitted", async () => {
    const harness = createWorkerHarness();

    await dispatchLifecycle(harness, "install");

    const requests = harness.networkFetch.mock.calls.map(([request]) => request as Request);
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/mobile/offline-v1.html",
      "/mobile/icon-v1.svg",
    ]);
    expect(requests.every((request) => request.method === "GET")).toBe(true);
    expect(requests.every((request) => request.credentials === "omit")).toBe(true);
    expect(requests.every((request) => /-v\d+\.[a-z]+$/.test(new URL(request.url).pathname))).toBe(
      true,
    );
    expect(harness.cache.put).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["an API request", new Request("https://tab.example/api/agents/receipts")],
    [
      "a non-GET request",
      new Request("https://tab.example/mobile/icon-v1.svg", { method: "POST" }),
    ],
    ["a cross-origin request", new Request("https://cdn.example/mobile/icon-v1.svg")],
    [
      "an authorized request",
      new Request("https://tab.example/mobile/icon-v1.svg", {
        credentials: "omit",
        headers: { authorization: "Bearer not-a-secret" },
      }),
    ],
    [
      "a credentialed request",
      new Request("https://tab.example/mobile/icon-v1.svg", { credentials: "include" }),
    ],
    ["an unversioned asset", new Request("https://tab.example/mobile/manifest.webmanifest")],
    [
      "a personalized asset URL",
      new Request("https://tab.example/mobile/icon-v1.svg?session=private", {
        credentials: "omit",
      }),
    ],
  ])("does not intercept %s", (_label, request) => {
    const harness = createWorkerHarness();

    expect(dispatchFetch(harness, request)).toBeUndefined();
    expect(harness.cache.match).not.toHaveBeenCalled();
    expect(harness.networkFetch).not.toHaveBeenCalled();
  });

  it("serves an allowlisted anonymous asset from the public cache", async () => {
    const cachedResponse = new Response("cached-public");
    const harness = createWorkerHarness({ cachedResponse });

    const response = dispatchFetch(
      harness,
      new Request("https://tab.example/mobile/icon-v1.svg", { credentials: "omit" }),
    );

    await expect(response).resolves.toBe(cachedResponse);
    expect(harness.networkFetch).not.toHaveBeenCalled();
  });

  it("never stores a response carrying authentication state", async () => {
    const harness = createWorkerHarness({
      networkResponse: new Response("private", {
        headers: {
          "cache-control": "private, no-store",
          "set-cookie": "session=redacted; Secure; HttpOnly",
          vary: "Cookie, Authorization",
        },
      }),
    });

    const response = dispatchFetch(
      harness,
      new Request("https://tab.example/mobile/offline-v1.html", { credentials: "omit" }),
    );

    await expect(response).resolves.toBeInstanceOf(Response);
    expect(harness.cache.put).not.toHaveBeenCalled();
  });

  it("opens only safe same-origin mobile paths from notification clicks", async () => {
    const harness = createWorkerHarness();
    const close = vi.fn();
    let work: Promise<unknown> | undefined;

    harness.listeners.get("notificationclick")?.({
      action: "revoke",
      notification: {
        close,
        data: { url: "https://attacker.example/api/agents/revoke" },
      },
      waitUntil: (value: Promise<unknown>) => {
        work = value;
      },
    });
    await work;

    expect(close).toHaveBeenCalledOnce();
    expect(harness.openWindow).toHaveBeenCalledWith("https://tab.example/mobile/");
    expect(harness.networkFetch).not.toHaveBeenCalled();
  });
});
