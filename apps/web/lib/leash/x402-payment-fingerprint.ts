import { createHash, timingSafeEqual } from "node:crypto";

const MAX_CANONICAL_BYTES = 16_384;
const MAX_DEPTH = 12;
const MAX_KEYS = 256;
const FINGERPRINT = /^[0-9a-f]{64}$/;

function canonical(value: unknown, depth = 0): string {
  if (depth > MAX_DEPTH) throw new Error("The x402 payment is not canonical.");
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonical(entry, depth + 1)).join(",")}]`;
  }
  if (typeof value !== "object") throw new Error("The x402 payment is not canonical.");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("The x402 payment is not canonical.");
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length > MAX_KEYS || keys.some((key) => record[key] === undefined)) {
    throw new Error("The x402 payment is not canonical.");
  }
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key], depth + 1)}`)
    .join(",")}}`;
}

export function fingerprintX402Payment(value: unknown) {
  const encoded = canonical(value);
  if (Buffer.byteLength(encoded, "utf8") > MAX_CANONICAL_BYTES) {
    throw new Error("The x402 payment exceeds the bounded fingerprint input.");
  }
  return createHash("sha256").update(encoded).digest("hex");
}

export function paymentFingerprintMatches(first: string, second: string) {
  if (!FINGERPRINT.test(first) || !FINGERPRINT.test(second)) return false;
  return timingSafeEqual(Buffer.from(first, "hex"), Buffer.from(second, "hex"));
}
