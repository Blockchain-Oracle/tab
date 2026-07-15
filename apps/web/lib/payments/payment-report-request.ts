import type { PaymentReportEvidence } from "./payment-report";

const REQUEST_KEYS = ["buyerDidToken", "tokenChanges", "transactionId"];
const MAX_DID_TOKEN_LENGTH = 8_192;
const MAX_EVIDENCE_DEPTH = 32;
const MAX_EVIDENCE_BYTES = 100_000;
const MAX_TOKEN_CHANGES = 64;
const MAX_TRANSACTION_ID_LENGTH = 512;

export const MAX_PAYMENT_REPORT_BODY_BYTES = 120_000;

export class InvalidPaymentReportError extends Error {
  readonly code = "INVALID_PAYMENT_REPORT";

  constructor() {
    super("The payment report is invalid.");
    this.name = "InvalidPaymentReportError";
  }
}

function containsControlCharacters(value: string) {
  for (const character of value) {
    const codePoint = character.charCodeAt(0);
    if (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159)) return true;
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validOpaqueValue(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    /^\S+$/u.test(value) &&
    !containsControlCharacters(value)
  );
}

function jsonSafe(value: unknown, depth = 0, ancestors = new Set<unknown>()): boolean {
  if (depth > MAX_EVIDENCE_DEPTH) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "string") return !containsControlCharacters(value);
  if (typeof value === "number") {
    return (
      Number.isFinite(value) &&
      Math.abs(value) <= Number.MAX_SAFE_INTEGER &&
      (!Number.isInteger(value) || Number.isSafeInteger(value)) &&
      !Object.is(value, -0)
    );
  }
  if (!Array.isArray(value) && !isRecord(value)) return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  const safe = Array.isArray(value)
    ? value.every((item) => jsonSafe(item, depth + 1, ancestors))
    : Object.entries(value).every(
        ([key, item]) => !containsControlCharacters(key) && jsonSafe(item, depth + 1, ancestors),
      );
  ancestors.delete(value);
  return safe;
}

function evidenceBytes(value: unknown[]) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export interface ParsedPaymentReport extends PaymentReportEvidence {
  buyerDidToken: string;
}

export function parsePaymentReportRequest(value: unknown): ParsedPaymentReport {
  if (!isRecord(value)) throw new InvalidPaymentReportError();
  const keys = Object.keys(value).sort();
  if (
    keys.length !== REQUEST_KEYS.length ||
    keys.some((key, index) => key !== REQUEST_KEYS[index]) ||
    !validOpaqueValue(value.buyerDidToken, MAX_DID_TOKEN_LENGTH) ||
    !validOpaqueValue(value.transactionId, MAX_TRANSACTION_ID_LENGTH) ||
    !Array.isArray(value.tokenChanges) ||
    value.tokenChanges.length === 0 ||
    value.tokenChanges.length > MAX_TOKEN_CHANGES ||
    value.tokenChanges.some((change) => !isRecord(change) || Object.keys(change).length === 0) ||
    !jsonSafe(value.tokenChanges) ||
    evidenceBytes(value.tokenChanges) > MAX_EVIDENCE_BYTES
  ) {
    throw new InvalidPaymentReportError();
  }

  return {
    buyerDidToken: value.buyerDidToken,
    tokenChanges: value.tokenChanges,
    transactionId: value.transactionId,
  };
}
