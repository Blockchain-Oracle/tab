const LEASH_KEY_PATTERN = /^leash_sk_[A-Za-z0-9_-]{43}$/;

export interface LeashCliConfig {
  apiBaseUrl: string;
  apiKey: string;
  upstreamUrl: string | null;
}

export class CliConfigurationError extends Error {
  readonly code = "INVALID_CONFIGURATION";

  constructor(message: string) {
    super(message);
    this.name = "CliConfigurationError";
  }
}

function httpUrl(value: string, field: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CliConfigurationError(`${field} must be an absolute HTTP URL.`);
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.hash.length > 0
  ) {
    throw new CliConfigurationError(`${field} must be an absolute HTTP URL.`);
  }
  return url;
}

function apiBaseUrl(value: string | undefined) {
  if (!value || value.trim() !== value) {
    throw new CliConfigurationError("LEASH_API_BASE_URL is required.");
  }
  const url = httpUrl(value, "LEASH_API_BASE_URL");
  if (url.pathname !== "/" || url.search.length > 0) {
    throw new CliConfigurationError("LEASH_API_BASE_URL must be an origin without a path.");
  }
  return url.toString();
}

function apiKey(value: string | undefined) {
  if (!value || !LEASH_KEY_PATTERN.test(value)) {
    throw new CliConfigurationError("LEASH_API_KEY is missing or malformed.");
  }
  return value;
}

function upstreamUrl(arguments_: readonly string[]) {
  if (arguments_.length === 0) return null;
  if (arguments_.length !== 2 || arguments_[0] !== "--upstream" || !arguments_[1]) {
    throw new CliConfigurationError("Usage: leash-mcp [--upstream <absolute-http-url>]");
  }
  return httpUrl(arguments_[1], "--upstream").toString();
}

export function parseLeashCliConfig(
  arguments_: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
): LeashCliConfig {
  return {
    apiBaseUrl: apiBaseUrl(environment.LEASH_API_BASE_URL),
    apiKey: apiKey(environment.LEASH_API_KEY),
    upstreamUrl: upstreamUrl(arguments_),
  };
}
