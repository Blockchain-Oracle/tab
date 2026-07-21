const LOCAL_SITE_ORIGIN = "http://localhost:3001";
const LOCAL_APP_ORIGIN = "http://localhost:3000";

const IS_DEPLOYMENT_BUILD =
  (Boolean(process.env.VERCEL_ENV) && process.env.VERCEL_ENV !== "development") ||
  process.env.TAB_DEPLOYMENT_ENV === "production";

function isLoopback(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function configuredOrigin(name: string, value: string | undefined, localFallback: string) {
  if (!value) {
    if (IS_DEPLOYMENT_BUILD) {
      throw new Error(`${name} is required for a production or preview deployment.`);
    }
    return new URL(localFallback);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL.`);
  }

  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${name} must be an origin without credentials, a path, query, or fragment.`);
  }

  const localHttp = url.protocol === "http:" && isLoopback(url.hostname) && !IS_DEPLOYMENT_BUILD;
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error(`${name} must use HTTPS outside local development.`);
  }

  return url;
}

export const SITE_ORIGIN = configuredOrigin(
  "NEXT_PUBLIC_SITE_URL",
  process.env.NEXT_PUBLIC_SITE_URL,
  LOCAL_SITE_ORIGIN,
);
export const APP_ORIGIN = configuredOrigin(
  "NEXT_PUBLIC_TAB_APP_URL",
  process.env.NEXT_PUBLIC_TAB_APP_URL,
  LOCAL_APP_ORIGIN,
);
export const DOCS_ORIGIN = configuredOrigin(
  "NEXT_PUBLIC_TAB_DOCS_URL",
  process.env.NEXT_PUBLIC_TAB_DOCS_URL,
  "http://localhost:3002",
);

export function appUrl(path: "/signup" | "/agents/login" | "/login") {
  return new URL(path, APP_ORIGIN).toString();
}

export function docsUrl(path: "/") {
  return new URL(path, DOCS_ORIGIN).toString();
}
