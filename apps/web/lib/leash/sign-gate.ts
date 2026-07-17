import type { agents } from "../db/schema";

export type SignGateCode =
  | "AGENT_PAUSED"
  | "AGENT_FROZEN"
  | "AGENT_CANCELLED"
  | "AUTHORIZATION_EXPIRED"
  | "CAP_CYCLE_CHANGED"
  | "INVALID_LEASH_KEY"
  | "LEASH_CAP_EXCEEDED"
  | "LEASH_CAP_NOT_SET"
  | "SIGNER_NOT_CONFIGURED"
  | "SIGN_REQUEST_CONFLICT";

export class SignGateError extends Error {
  constructor(
    readonly code: SignGateCode,
    readonly status: number,
  ) {
    super("The signing request cannot proceed.");
    this.name = "SignGateError";
  }
}

export function statusGateError(status: typeof agents.$inferSelect.status) {
  if (status === "paused") return new SignGateError("AGENT_PAUSED", 423);
  if (status === "frozen") return new SignGateError("AGENT_FROZEN", 423);
  if (status === "cancelled" || status === "nuked") {
    return new SignGateError("AGENT_CANCELLED", 423);
  }
  return null;
}
