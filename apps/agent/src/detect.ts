import { decodePaymentRequiredHeader } from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import { extractPaymentRequiredFromError, isPaymentRequiredError } from "@x402/mcp";

interface LegacyPaymentRequired {
  accepts: unknown[];
  error?: string;
  x402Version: 1;
}

export type DetectedPaymentRequired = PaymentRequired | LegacyPaymentRequired;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function paymentRequired(value: unknown): PaymentRequired | null {
  if (!record(value) || typeof value.x402Version !== "number") return null;
  if (!Array.isArray(value.accepts) || value.accepts.length === 0) return null;
  if (!record(value.resource) || typeof value.resource.url !== "string") return null;
  return value as PaymentRequired;
}

function legacyPaymentRequired(value: unknown): LegacyPaymentRequired | null {
  if (!record(value) || value.x402Version !== 1) return null;
  if (!Array.isArray(value.accepts) || value.accepts.length === 0) return null;
  return value as unknown as LegacyPaymentRequired;
}

function paymentRequiredFromText(value: unknown) {
  if (!record(value) || value.type !== "text" || typeof value.text !== "string") return null;
  try {
    return paymentRequired(JSON.parse(value.text));
  } catch {
    return null;
  }
}

export function detectMcpPaymentRequired(value: unknown): PaymentRequired | null {
  if (isPaymentRequiredError(value)) {
    const extracted = extractPaymentRequiredFromError(value);
    if (extracted) return extracted;
    const data: unknown = value.data;
    if (record(data)) {
      return paymentRequired(data.x402) ?? paymentRequired(data);
    }
  }
  if (!record(value) || value.isError !== true) return null;

  const structured = paymentRequired(value.structuredContent);
  if (structured) return structured;
  if (!Array.isArray(value.content)) return null;
  for (const item of value.content) {
    const detected = paymentRequiredFromText(item);
    if (detected) return detected;
  }
  return null;
}

export async function detectHttpPaymentRequired(
  response: Response,
): Promise<DetectedPaymentRequired | null> {
  if (response.status !== 402) return null;

  const header = response.headers.get("PAYMENT-REQUIRED");
  if (header) {
    try {
      return paymentRequired(decodePaymentRequiredHeader(header));
    } catch {
      return null;
    }
  }

  try {
    return legacyPaymentRequired(await response.clone().json());
  } catch {
    return null;
  }
}
