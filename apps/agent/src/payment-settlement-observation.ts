import type { SettleResponse } from "@x402/core/types";
import { getAddress, isAddress } from "viem";

export type PaymentSettlementObservation = SettleResponse & { payer: string };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactAllowedKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  allowed: readonly string[],
) {
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.includes(key))
  );
}

function boundedJsonRecord(value: unknown) {
  if (!record(value)) return false;
  try {
    const serialized = JSON.stringify(value);
    return serialized !== undefined && new TextEncoder().encode(serialized).byteLength <= 4_096;
  } catch {
    return false;
  }
}

export function parsePaymentSettlementObservation(
  value: unknown,
  expected: { amount?: string; network?: string; payer?: string } = {},
): PaymentSettlementObservation | null {
  if (!record(value) || typeof value.success !== "boolean") return null;
  const required = value.success
    ? ["network", "payer", "success", "transaction"]
    : ["errorReason", "network", "payer", "success", "transaction"];
  const allowed = value.success
    ? [...required, "amount", "extensions", "extra"]
    : [...required, "amount", "errorMessage", "extensions", "extra"];
  if (!exactAllowedKeys(value, required, allowed)) return null;
  if (
    typeof value.network !== "string" ||
    value.network.length < 3 ||
    value.network.length > 128 ||
    !value.network.includes(":") ||
    (expected.network !== undefined && value.network !== expected.network) ||
    typeof value.payer !== "string" ||
    !isAddress(value.payer) ||
    (expected.payer !== undefined &&
      (!isAddress(expected.payer) || getAddress(value.payer) !== getAddress(expected.payer))) ||
    typeof value.transaction !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(value.transaction) ||
    (value.amount !== undefined &&
      (typeof value.amount !== "string" ||
        !/^(0|[1-9][0-9]*)$/.test(value.amount) ||
        value.amount.length > 78 ||
        expected.amount === undefined ||
        value.amount !== expected.amount)) ||
    (value.extensions !== undefined && !boundedJsonRecord(value.extensions)) ||
    (value.extra !== undefined && !boundedJsonRecord(value.extra))
  ) {
    return null;
  }
  const common = {
    network: value.network,
    payer: getAddress(value.payer),
    transaction: value.transaction,
  };
  if (value.success) return { ...common, success: true } as PaymentSettlementObservation;
  if (
    typeof value.errorReason !== "string" ||
    !/\S/.test(value.errorReason) ||
    value.errorReason.length > 256 ||
    (value.errorMessage !== undefined &&
      (typeof value.errorMessage !== "string" ||
        !/\S/.test(value.errorMessage) ||
        value.errorMessage.length > 2_048))
  ) {
    return null;
  }
  return {
    ...common,
    ...(value.errorMessage === undefined ? {} : { errorMessage: value.errorMessage }),
    errorReason: value.errorReason,
    success: false,
  } as PaymentSettlementObservation;
}
