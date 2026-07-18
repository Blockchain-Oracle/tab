import {
  type PaymentSettlementObservation,
  parsePaymentSettlementObservation,
} from "./payment-settlement-observation.js";

export const MAX_PAYMENT_ENVELOPE_RECORDS = 1_024;
export const MAX_PAYMENT_ENVELOPE_STORE_BYTES = 4 * 1_024 * 1_024;

export type PaymentEnvelopeState = "observed" | "pending" | "settled";

export interface PaymentEnvelopeRecord {
  readonly createdAt: string;
  readonly paymentSignature: string;
  readonly receiptId: string;
  readonly requestFingerprint: string;
  readonly settlementObservation?: PaymentSettlementObservation;
  readonly state: PaymentEnvelopeState;
  readonly updatedAt: string;
  readonly validBefore: number;
}

export interface NewPaymentEnvelope {
  readonly paymentSignature: string;
  readonly receiptId: string;
  readonly validBefore: number;
}

export interface PaymentEnvelopeDocument {
  records: Record<string, PaymentEnvelopeRecord>;
  version: 1;
}

export type PaymentEnvelopeStoreErrorCode =
  | "PAYMENT_ENVELOPE_CAPACITY"
  | "PAYMENT_ENVELOPE_CHAIN_STATE_UNRESOLVED"
  | "PAYMENT_ENVELOPE_CONFLICT"
  | "PAYMENT_ENVELOPE_CORRUPT"
  | "PAYMENT_ENVELOPE_INVALID_INPUT"
  | "PAYMENT_ENVELOPE_LOCK_TIMEOUT"
  | "PAYMENT_ENVELOPE_NOT_FOUND"
  | "PAYMENT_ENVELOPE_OVERSIZE"
  | "PAYMENT_ENVELOPE_PENDING";

export class PaymentEnvelopeStoreError extends Error {
  constructor(
    readonly code: PaymentEnvelopeStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PaymentEnvelopeStoreError";
  }
}

function invalid(): never {
  throw new PaymentEnvelopeStoreError(
    "PAYMENT_ENVELOPE_CORRUPT",
    "The durable payment envelope store is invalid.",
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    invalid();
  }
}

function canonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.valueOf()) && timestamp.toISOString() === value;
}

export function validatePaymentIdempotencyKey(value: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new PaymentEnvelopeStoreError(
      "PAYMENT_ENVELOPE_INVALID_INPUT",
      "The payment idempotency key is invalid.",
    );
  }
  return value;
}

export function validateRequestFingerprint(value: string) {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new PaymentEnvelopeStoreError(
      "PAYMENT_ENVELOPE_INVALID_INPUT",
      "The payment request fingerprint is invalid.",
    );
  }
  return value;
}

function validPaymentSignature(value: unknown): value is string {
  return typeof value === "string" && value.length <= 32_768 && /^[A-Za-z0-9+/_=-]+$/.test(value);
}

function validReceiptId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

function validBefore(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value > 0;
}

export function validateNewPaymentEnvelope(value: NewPaymentEnvelope): NewPaymentEnvelope {
  if (
    !record(value) ||
    !validPaymentSignature(value.paymentSignature) ||
    !validReceiptId(value.receiptId) ||
    !validBefore(value.validBefore)
  ) {
    throw new PaymentEnvelopeStoreError(
      "PAYMENT_ENVELOPE_INVALID_INPUT",
      "The new payment envelope is invalid.",
    );
  }
  exactKeys(value, ["paymentSignature", "receiptId", "validBefore"]);
  return value;
}

function validateStoredRecord(value: unknown): PaymentEnvelopeRecord {
  if (!record(value)) invalid();
  const baseKeys = [
    "createdAt",
    "paymentSignature",
    "receiptId",
    "requestFingerprint",
    "state",
    "updatedAt",
    "validBefore",
  ];
  const hasObservation = Object.hasOwn(value, "settlementObservation");
  exactKeys(value, hasObservation ? [...baseKeys, "settlementObservation"] : baseKeys);
  if (
    !canonicalTimestamp(value.createdAt) ||
    !validPaymentSignature(value.paymentSignature) ||
    !validReceiptId(value.receiptId) ||
    typeof value.requestFingerprint !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.requestFingerprint) ||
    (value.state !== "pending" && value.state !== "observed" && value.state !== "settled") ||
    !canonicalTimestamp(value.updatedAt) ||
    !validBefore(value.validBefore)
  ) {
    invalid();
  }
  const observation = hasObservation
    ? parsePaymentSettlementObservation(value.settlementObservation)
    : null;
  if (
    (hasObservation && !observation) ||
    (value.state === "observed" && !observation) ||
    (value.state === "pending" && hasObservation)
  ) {
    invalid();
  }
  if (observation) value.settlementObservation = observation;
  return value as unknown as PaymentEnvelopeRecord;
}

export function parsePaymentEnvelopeDocument(value: unknown): PaymentEnvelopeDocument {
  if (!record(value)) invalid();
  exactKeys(value, ["records", "version"]);
  if (value.version !== 1 || !record(value.records)) invalid();
  const entries = Object.entries(value.records);
  if (entries.length > MAX_PAYMENT_ENVELOPE_RECORDS) invalid();
  const records: Record<string, PaymentEnvelopeRecord> = {};
  let pending = 0;
  for (const [key, stored] of entries) {
    try {
      validatePaymentIdempotencyKey(key);
    } catch {
      invalid();
    }
    records[key] = validateStoredRecord(stored);
    if (records[key].state !== "settled") pending += 1;
  }
  if (pending > 1) invalid();
  return { records, version: 1 };
}
