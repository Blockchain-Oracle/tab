import {
  BASE_SEPOLIA_INTEGRATION_PROFILE,
  networksForPaymentProfile,
  type PaymentProfile,
} from "../../../../lib/leash/payment-profile";
import { TEST_FUNDS_LABEL } from "../../../../lib/leash/test-funds";

export type LiveRead =
  | { state: "loading" }
  | { health?: "partial" | "unavailable"; readAt?: string; state: "unavailable" }
  | { readAt: string; state: "available"; totalAtomic: string };

type FloatRead = {
  balanceAtomic: string | null;
  label: string;
  network: string;
  testFunds: boolean;
};

export function parseLiveRead(
  value: unknown,
  agentId: string,
  paymentProfile: PaymentProfile,
): LiveRead {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { state: "unavailable" };
  }
  const body = value as Record<string, unknown>;
  const readAt = typeof body.readAt === "string" ? body.readAt : "";
  const timestamp = new Date(readAt);
  const health = body.health;
  const floats = body.floats;
  const testFunds = paymentProfile === BASE_SEPOLIA_INTEGRATION_PROFILE;
  if (
    body.agentId !== agentId ||
    body.paymentProfile !== paymentProfile ||
    body.testFunds !== testFunds ||
    body.testFundsLabel !== (testFunds ? TEST_FUNDS_LABEL : null) ||
    Number.isNaN(timestamp.getTime()) ||
    timestamp.toISOString() !== readAt ||
    !["healthy", "partial", "unavailable"].includes(String(health))
  ) {
    return { state: "unavailable" };
  }
  const expected = networksForPaymentProfile(paymentProfile);
  if (!Array.isArray(floats) || floats.length !== expected.length) {
    return { health: "unavailable", readAt, state: "unavailable" };
  }
  const valid = floats.every((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return false;
    const row = item as FloatRead;
    return (
      row.label === expected[index]?.label &&
      row.network === expected[index]?.network &&
      row.testFunds === expected[index]?.testFunds &&
      (row.balanceAtomic === null || /^\d+$/.test(row.balanceAtomic))
    );
  });
  if (!valid) return { state: "unavailable" };
  if (health !== "healthy" || floats.some((item) => (item as FloatRead).balanceAtomic === null)) {
    return {
      health: health === "partial" ? "partial" : "unavailable",
      readAt,
      state: "unavailable",
    };
  }
  const total = floats.reduce(
    (sum, item) => sum + BigInt((item as FloatRead).balanceAtomic ?? "0"),
    BigInt(0),
  );
  return { readAt, state: "available", totalAtomic: total.toString() };
}

export function readLabel(read: LiveRead) {
  if (read.state === "loading") return null;
  const health = read.state === "available" ? "healthy" : (read.health ?? "unavailable");
  const timestamp = read.readAt
    ? `Read ${read.readAt.slice(0, 19).replace("T", " ")} UTC`
    : "No verified read time";
  return `RPC ${health} · ${timestamp}`;
}
