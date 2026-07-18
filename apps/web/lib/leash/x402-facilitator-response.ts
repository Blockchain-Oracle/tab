import { z } from "@x402/core/schemas";
import {
  FacilitatorResponseError,
  type Network,
  SettleError,
  type SettleResponse,
  type SupportedResponse,
  VerifyError,
  type VerifyResponse,
} from "@x402/core/types";

const optionalString = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined);
const optionalRecord = z
  .record(z.string(), z.unknown())
  .nullish()
  .transform((value) => value ?? undefined);
const network = z.custom<Network>((value) => typeof value === "string");

const verifyResponseSchema = z.object({
  extensions: optionalRecord,
  extra: optionalRecord,
  invalidMessage: optionalString,
  invalidReason: optionalString,
  isValid: z.boolean(),
  payer: optionalString,
});

const settleResponseSchema = z.object({
  amount: optionalString,
  errorMessage: optionalString,
  errorReason: optionalString,
  extensions: optionalRecord,
  extra: optionalRecord,
  network,
  payer: optionalString,
  success: z.boolean(),
  transaction: z.string(),
});

const supportedKindSchema = z.object({
  extra: optionalRecord,
  network,
  scheme: z.string(),
  x402Version: z.number(),
});

const supportedResponseSchema = z.object({
  extensions: z.array(z.string()).default([]),
  kinds: z.array(supportedKindSchema),
  signers: z.record(z.string(), z.array(z.string())).default({}),
});

const SAFE_REASON = /^[a-zA-Z][a-zA-Z0-9_.:-]{0,95}$/;
const ADDRESS = /^0x[\da-f]{40}$/i;
const TRANSACTION = /^(?:0x[\da-f]{64})?$/i;
const NETWORK = /^[a-zA-Z0-9-]{1,32}:[a-zA-Z0-9-]{1,64}$/;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeString(value: unknown, pattern: RegExp) {
  return typeof value === "string" && pattern.test(value) ? value : undefined;
}

function parseJson(text: string) {
  try {
    return { parsed: true as const, value: JSON.parse(text) as unknown };
  } catch {
    return { parsed: false as const };
  }
}

export function parseFacilitatorSuccess(operation: "settle", text: string): SettleResponse;
export function parseFacilitatorSuccess(operation: "supported", text: string): SupportedResponse;
export function parseFacilitatorSuccess(operation: "verify", text: string): VerifyResponse;
export function parseFacilitatorSuccess(
  operation: "settle" | "supported" | "verify",
  text: string,
) {
  const decoded = parseJson(text);
  if (!decoded.parsed) {
    throw new FacilitatorResponseError(`Facilitator ${operation} returned invalid JSON.`);
  }
  const schema =
    operation === "verify"
      ? verifyResponseSchema
      : operation === "settle"
        ? settleResponseSchema
        : supportedResponseSchema;
  const result = schema.safeParse(decoded.value);
  if (!result.success) {
    throw new FacilitatorResponseError(`Facilitator ${operation} returned invalid data.`);
  }
  return result.data;
}

export function throwFacilitatorFailure(
  operation: "settle" | "supported" | "verify",
  status: number,
  text: string,
  fallbackNetwork?: Network,
): never {
  const decoded = parseJson(text);
  const value = decoded.parsed ? decoded.value : undefined;
  if (operation === "verify" && record(value) && "isValid" in value) {
    const invalidReason = safeString(value.invalidReason, SAFE_REASON);
    const payer = safeString(value.payer, ADDRESS);
    throw new VerifyError(status, {
      ...(invalidReason ? { invalidReason } : {}),
      isValid: false,
      ...(payer ? { payer } : {}),
    });
  }
  if (operation === "settle" && record(value) && "success" in value) {
    const errorReason = safeString(value.errorReason, SAFE_REASON);
    const network = safeString(value.network, NETWORK) as Network | undefined;
    const payer = safeString(value.payer, ADDRESS);
    throw new SettleError(status, {
      ...(errorReason ? { errorReason } : {}),
      network: network ?? fallbackNetwork ?? "eip155:84532",
      ...(payer ? { payer } : {}),
      success: false,
      transaction: safeString(value.transaction, TRANSACTION) ?? "",
    });
  }
  throw new Error(`Facilitator ${operation} failed (${status}).`);
}
