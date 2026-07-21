import type { agents } from "../db/schema";

export type SignGateCode =
  | "AGENT_PAUSED"
  | "AGENT_FROZEN"
  | "AGENT_CANCELLED"
  | "AUTHORIZATION_EXPIRED"
  | "CAP_CYCLE_CHANGED"
  | "INVALID_AGENT_KEY"
  | "CAP_EXCEEDED"
  | "CAP_NOT_SET"
  | "SIGNER_NOT_CONFIGURED"
  | "SIGNER_IDENTITY_MISMATCH"
  | "SIGNER_PROVIDER_INVALID_RESPONSE"
  | "SIGNER_PROVIDER_REJECTED"
  | "SIGN_REQUEST_IN_PROGRESS"
  | "SIGN_REQUEST_RECONCILING"
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

export function preParseStatusGateError(status: typeof agents.$inferSelect.status) {
  if (status === "paused") return new SignGateError("AGENT_PAUSED", 423);
  if (status === "cancelled" || status === "nuked") {
    return new SignGateError("AGENT_CANCELLED", 423);
  }
  return null;
}

export function statusGateError(status: typeof agents.$inferSelect.status) {
  return status === "frozen"
    ? new SignGateError("AGENT_FROZEN", 423)
    : preParseStatusGateError(status);
}
