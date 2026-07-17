const CAP_FREQUENCIES = new Set(["daily", "weekly", "monthly", "never"]);
const MAX_CAP_USD_CENTS = BigInt("99999999999999999999");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CapFrequency = "daily" | "weekly" | "monthly" | "never";

export class InvalidCapInputError extends Error {
  readonly code = "INVALID_CAP";

  constructor() {
    super("Choose a positive cap amount and reset frequency.");
    this.name = "InvalidCapInputError";
  }
}

function exactRecord(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidCapInputError();
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 3 || keys.join("\0") !== "agentId\0amount\0frequency") {
    throw new InvalidCapInputError();
  }
  return record;
}

export function parseAgentTarget(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidCapInputError();
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 1 ||
    typeof record.agentId !== "string" ||
    !UUID.test(record.agentId)
  ) {
    throw new InvalidCapInputError();
  }
  return { agentId: record.agentId };
}

function amountInCents(value: unknown) {
  if (typeof value !== "string") throw new InvalidCapInputError();
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(value.trim());
  if (!match?.[1]) throw new InvalidCapInputError();
  const cents = BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  if (cents === BigInt(0) || cents > MAX_CAP_USD_CENTS) throw new InvalidCapInputError();
  return cents.toString();
}

export function parseCapMutation(value: unknown) {
  const input = exactRecord(value);
  if (typeof input.agentId !== "string" || !UUID.test(input.agentId)) {
    throw new InvalidCapInputError();
  }
  if (typeof input.frequency !== "string" || !CAP_FREQUENCIES.has(input.frequency)) {
    throw new InvalidCapInputError();
  }
  return {
    agentId: input.agentId,
    amountUsdCents: amountInCents(input.amount),
    frequency: input.frequency as CapFrequency,
  };
}
