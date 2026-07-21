import { validateControlPlaneOrigin } from "./control-plane-origin.js";
import { validatePaymentTarget } from "./payment-target-policy.js";

const LEASH_KEY_PATTERN = /^agent_sk_[A-Za-z0-9_-]{43}$/;

export interface LeashCliConfig {
  allowDevelopmentLoopback: boolean;
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

function httpUrl(value: string, field: string, allowDevelopmentLoopback: boolean) {
  try {
    return validatePaymentTarget(value, { allowDevelopmentLoopback });
  } catch {
    throw new CliConfigurationError(`${field} must use HTTPS, except for loopback development.`);
  }
}

function apiBaseUrl(value: string | undefined) {
  if (!value || value.trim() !== value) {
    throw new CliConfigurationError("TAB_API_BASE_URL is required.");
  }
  try {
    return validateControlPlaneOrigin(value);
  } catch {
    throw new CliConfigurationError(
      "TAB_API_BASE_URL must be an HTTPS origin, except for loopback development.",
    );
  }
}

function apiKey(value: string | undefined) {
  if (!value || !LEASH_KEY_PATTERN.test(value)) {
    throw new CliConfigurationError("TAB_AGENT_KEY is missing or malformed.");
  }
  return value;
}

function developmentLoopback(value: string | undefined) {
  if (value === undefined || value === "0") return false;
  if (value === "1") return true;
  throw new CliConfigurationError("TAB_ALLOW_DEVELOPMENT_LOOPBACK must be 0 or 1.");
}

function upstreamUrl(arguments_: readonly string[], allowDevelopmentLoopback: boolean) {
  if (arguments_.length === 0) return null;
  if (arguments_.length !== 2 || arguments_[0] !== "--upstream" || !arguments_[1]) {
    throw new CliConfigurationError("Usage: tab-mcp [--upstream <absolute-http-url>]");
  }
  return httpUrl(arguments_[1], "--upstream", allowDevelopmentLoopback);
}

export function parseLeashCliConfig(
  arguments_: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
): LeashCliConfig {
  const allowDevelopmentLoopback = developmentLoopback(environment.TAB_ALLOW_DEVELOPMENT_LOOPBACK);
  return {
    allowDevelopmentLoopback,
    apiBaseUrl: apiBaseUrl(environment.TAB_API_BASE_URL),
    apiKey: apiKey(environment.TAB_AGENT_KEY),
    upstreamUrl: upstreamUrl(arguments_, allowDevelopmentLoopback),
  };
}
