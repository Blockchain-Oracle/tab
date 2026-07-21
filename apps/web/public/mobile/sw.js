const CACHE_NAME = "tab-mobile-shell-v1";
const PUBLIC_ASSETS = ["/mobile/offline-v1.html", "/mobile/icon-v1.svg"];
const PUBLIC_PATHS = new Set(PUBLIC_ASSETS);

function anonymousRequest(path) {
  return new Request(new URL(path, self.location.origin), {
    credentials: "omit",
    method: "GET",
  });
}

function carriesAuthenticationState(response) {
  const cacheControl = response.headers.get("cache-control") ?? "";
  const vary = response.headers.get("vary") ?? "";

  return (
    response.headers.has("set-cookie") ||
    /(?:^|,)\s*(?:private|no-store)(?:\s|,|=|$)/i.test(cacheControl) ||
    /(?:^|,)\s*(?:authorization|cookie)\s*(?:,|$)/i.test(vary)
  );
}

async function cachePublicAsset(cache, request, response) {
  if (!response.ok || carriesAuthenticationState(response)) return;
  await cache.put(request, response.clone());
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      for (const path of PUBLIC_ASSETS) {
        const request = anonymousRequest(path);
        const response = await fetch(request);
        await cachePublicAsset(cache, request, response);
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("tab-mobile-shell-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

function isAnonymousPublicAsset(request) {
  if (request.method !== "GET" || request.credentials !== "omit") return false;
  if (request.headers.has("authorization") || request.headers.has("cookie")) return false;

  const url = new URL(request.url);
  return (
    url.origin === self.location.origin &&
    url.search === "" &&
    url.hash === "" &&
    PUBLIC_PATHS.has(url.pathname)
  );
}

async function publicCacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  await cachePublicAsset(cache, request, response);
  return response;
}

self.addEventListener("fetch", (event) => {
  if (!isAnonymousPublicAsset(event.request)) return;
  event.respondWith(publicCacheFirst(event.request));
});

function notificationTarget(data) {
  const fallback = new URL("/mobile/", self.location.origin);
  if (!data || typeof data.url !== "string") return fallback.href;

  try {
    const candidate = new URL(data.url, self.location.origin);
    if (
      candidate.origin === self.location.origin &&
      (candidate.pathname === "/mobile" || candidate.pathname.startsWith("/mobile/"))
    ) {
      return candidate.href;
    }
  } catch {
    return fallback.href;
  }

  return fallback.href;
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(notificationTarget(event.notification.data)));
});
