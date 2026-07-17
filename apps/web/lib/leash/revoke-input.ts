const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIMPLE_ACTIONS = new Set(["pause", "resume", "freeze", "unfreeze"]);

export type RevokeAction = "pause" | "resume" | "freeze" | "unfreeze" | "cancel" | "nuclear";

export class InvalidRevokeInputError extends Error {
  constructor() {
    super("Choose a valid revocation action and confirmation.");
    this.name = "InvalidRevokeInputError";
  }
}

function exactKeys(value: Record<string, unknown>, expected: string[]) {
  return Object.keys(value).sort().join("\0") === expected.sort().join("\0");
}

export function parseRevokeRequest(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidRevokeInputError();
  }
  const input = value as Record<string, unknown>;
  if (typeof input.agentId !== "string" || !UUID.test(input.agentId)) {
    throw new InvalidRevokeInputError();
  }
  if (
    typeof input.action === "string" &&
    SIMPLE_ACTIONS.has(input.action) &&
    exactKeys(input, ["action", "agentId"])
  ) {
    return {
      action: input.action as Exclude<RevokeAction, "cancel" | "nuclear">,
      agentId: input.agentId,
    };
  }
  if (
    input.action === "cancel" &&
    input.confirmation === "CANCEL" &&
    exactKeys(input, ["action", "agentId", "confirmation"])
  ) {
    return { action: "cancel" as const, agentId: input.agentId, confirmation: "CANCEL" as const };
  }
  if (
    input.action === "nuclear" &&
    typeof input.confirmation === "string" &&
    input.confirmation.length > 0 &&
    exactKeys(input, ["action", "agentId", "confirmation"])
  ) {
    return { action: "nuclear" as const, agentId: input.agentId, confirmation: input.confirmation };
  }
  throw new InvalidRevokeInputError();
}
