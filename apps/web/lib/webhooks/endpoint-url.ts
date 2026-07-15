import { isIP } from "node:net";

export type WebhookEnvironment = "live" | "test";

export class InvalidWebhookEndpointUrlError extends Error {
  constructor(options?: ErrorOptions) {
    super("Webhook endpoint URL is invalid", options);
    this.name = "InvalidWebhookEndpointUrlError";
  }
}

function hostnameWithoutBrackets(url: URL) {
  return url.hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

function loopbackHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function publicHostname(hostname: string) {
  if (isIP(hostname) !== 0 || !hostname.includes(".")) return false;
  return ![".localhost", ".local", ".internal"].some(
    (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
  );
}

export function parseWebhookEndpointUrl(value: string, env: WebhookEnvironment = "live") {
  if (value.length === 0 || value.length > 2048 || value.trim() !== value) {
    throw new InvalidWebhookEndpointUrlError();
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new InvalidWebhookEndpointUrlError({ cause: error });
  }
  const hostname = hostnameWithoutBrackets(url);
  const localTestEndpoint =
    env === "test" && url.protocol === "http:" && loopbackHostname(hostname);
  const publicHttpsEndpoint = url.protocol === "https:" && publicHostname(hostname);

  if (
    (!localTestEndpoint && !publicHttpsEndpoint) ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== ""
  ) {
    throw new InvalidWebhookEndpointUrlError();
  }
  return url.toString();
}
