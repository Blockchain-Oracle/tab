export class SignerNotConfiguredError extends Error {
  readonly code = "SIGNER_NOT_CONFIGURED";

  constructor() {
    super("SIGNER_NOT_CONFIGURED: Agent signing is not configured for this agent.");
    this.name = "SignerNotConfiguredError";
  }
}
