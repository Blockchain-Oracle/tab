const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);

export class InvalidControlPlaneOriginError extends Error {
  constructor() {
    super("The Leash control-plane origin is invalid.");
    this.name = "InvalidControlPlaneOriginError";
  }
}

export function validateControlPlaneOrigin(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InvalidControlPlaneOriginError();
  }
  const secure = url.protocol === "https:";
  const loopbackDevelopment = url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
  if (
    (!secure && !loopbackDevelopment) ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.pathname !== "/" ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new InvalidControlPlaneOriginError();
  }
  return url.toString();
}
