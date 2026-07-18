import { isIP } from "node:net";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const PRIVATE_HOST_SUFFIXES = [".home.arpa", ".internal", ".local", ".localhost"];

export class PaymentTargetPolicyError extends Error {
  readonly code = "UNSAFE_PAYMENT_TARGET";

  constructor() {
    super("The payment target is not permitted by Leash network policy.");
    this.name = "PaymentTargetPolicyError";
  }
}

function unbracket(hostname: string) {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

function privateIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [first = 0, second = 0] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && (second === 0 || second === 168)) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function privateHostname(hostname: string) {
  const normalized = unbracket(hostname.toLowerCase());
  if (LOOPBACK_HOSTS.has(normalized)) return true;
  const version = isIP(normalized);
  if (version === 4) return privateIpv4(normalized);
  if (version === 6) {
    return !/^[23]/.test(normalized) || normalized.startsWith("2001:db8:");
  }
  return (
    !normalized.includes(".") ||
    normalized === "metadata.google.internal" ||
    PRIVATE_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  );
}

function loopbackHostname(hostname: string) {
  const normalized = unbracket(hostname.toLowerCase());
  if (LOOPBACK_HOSTS.has(normalized)) return true;
  if (isIP(normalized) !== 4) return false;
  return Number(normalized.split(".")[0]) === 127;
}

export interface PaymentTargetPolicyOptions {
  allowDevelopmentLoopback?: boolean;
}

export function isLoopbackPaymentHostname(hostname: string) {
  return loopbackHostname(hostname);
}

export function validatePaymentTarget(value: string, options: PaymentTargetPolicyOptions = {}) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PaymentTargetPolicyError();
  }
  const loopbackDevelopment =
    options.allowDevelopmentLoopback === true &&
    url.protocol === "http:" &&
    loopbackHostname(url.hostname);
  if (
    (url.protocol !== "https:" && !loopbackDevelopment) ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    (privateHostname(url.hostname) && !loopbackDevelopment)
  ) {
    throw new PaymentTargetPolicyError();
  }
  return url.toString();
}

export function safePaymentRequestInit(init?: RequestInit): RequestInit {
  return { ...init, redirect: "error" };
}
