import { randomBytes } from "node:crypto";

const DELIVERY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PaymentSettledPayloadInput {
  id: string;
  livemode: boolean;
  tokenChanges: unknown[];
  transactionId: string;
}

export class InvalidWebhookPayloadError extends Error {
  constructor(reason: "envelope" | "non-JSON") {
    super(`Invalid webhook payload ${reason}`);
    this.name = "InvalidWebhookPayloadError";
  }
}

function invalidJson(): never {
  throw new InvalidWebhookPayloadError("non-JSON");
}

function encodePrimitive(value: string | number | boolean | null) {
  if (typeof value === "number" && (!Number.isFinite(value) || Object.is(value, -0))) {
    invalidJson();
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) invalidJson();
  return encoded;
}

function encodeArray(value: unknown[], ancestors: Set<object>): string {
  if (Object.getPrototypeOf(value) !== Array.prototype || ancestors.has(value)) invalidJson();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || keys.some((key) => typeof key !== "string")) {
    invalidJson();
  }

  ancestors.add(value);
  try {
    const encoded = Array.from({ length: value.length }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !("value" in descriptor)) invalidJson();
      return encodeJson(descriptor.value, ancestors);
    });
    return `[${encoded.join(",")}]`;
  } finally {
    ancestors.delete(value);
  }
}

function encodeRecord(value: object, ancestors: Set<object>): string {
  const prototype = Object.getPrototypeOf(value);
  if ((prototype !== Object.prototype && prototype !== null) || ancestors.has(value)) invalidJson();
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) invalidJson();

  ancestors.add(value);
  try {
    const encoded = (keys as string[]).sort().map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) invalidJson();
      return `${encodePrimitive(key)}:${encodeJson(descriptor.value, ancestors)}`;
    });
    return `{${encoded.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function encodeJson(value: unknown, ancestors: Set<object>): string {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return encodePrimitive(value as string | number | boolean | null);
  }
  if (Array.isArray(value)) return encodeArray(value, ancestors);
  if (typeof value === "object") return encodeRecord(value, ancestors);
  return invalidJson();
}

export function createWebhookEventId(): string {
  return `evt_${randomBytes(24).toString("base64url")}`;
}

export function serializePaymentSettledPayload(input: PaymentSettledPayloadInput): string {
  if (
    !DELIVERY_ID_PATTERN.test(input.id) ||
    typeof input.livemode !== "boolean" ||
    typeof input.transactionId !== "string" ||
    input.transactionId.length === 0 ||
    !Array.isArray(input.tokenChanges)
  ) {
    throw new InvalidWebhookPayloadError("envelope");
  }

  const transactionId = encodePrimitive(input.transactionId);
  const tokenChanges = encodeJson(input.tokenChanges, new Set());
  return `{"id":${encodePrimitive(input.id)},"type":"payment.settled","livemode":${input.livemode},"transactionId":${transactionId},"tokenChanges":${tokenChanges}}`;
}
