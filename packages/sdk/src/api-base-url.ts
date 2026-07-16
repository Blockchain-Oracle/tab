import { CheckoutApiError } from "./checkout-types";

function invalidApiBaseUrl(): never {
  throw new CheckoutApiError(
    "INVALID_API_BASE_URL",
    "Tab apiBaseUrl must be an HTTPS API root or a loopback HTTP API root.",
  );
}

function loopbackHostname(hostname: string) {
  const ipv4 = hostname.split(".");
  const loopbackIpv4 =
    ipv4.length === 4 &&
    ipv4[0] === "127" &&
    ipv4.every((part) => /^(0|[1-9][0-9]{0,2})$/.test(part) && Number(part) <= 255);
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "[::1]" ||
    loopbackIpv4
  );
}

export function normalizeApiBaseUrl(value: string) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    return invalidApiBaseUrl();
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalidApiBaseUrl();
  }
  if (
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopbackHostname(url.hostname)))
  ) {
    return invalidApiBaseUrl();
  }
  return url.origin;
}
