const MAX_RESOURCE_HOST_LENGTH = 253;
const MAX_RESOURCE_URL_LENGTH = 2_048;
const SUPPORTED_RESOURCE_PROTOCOLS = new Set(["http:", "https:", "mcp:"]);

export class InvalidPaymentResourceUrlError extends Error {
  readonly code = "INVALID_PAYMENT_RESOURCE_URL";

  constructor() {
    super("Payment resource URL must be a supported absolute URL.");
    this.name = "InvalidPaymentResourceUrlError";
  }
}

export function redactPaymentResourceUrl(value: string) {
  if (value.length < 1 || value.length > MAX_RESOURCE_URL_LENGTH) {
    throw new InvalidPaymentResourceUrlError();
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InvalidPaymentResourceUrlError();
  }
  if (
    !SUPPORTED_RESOURCE_PROTOCOLS.has(url.protocol) ||
    url.hostname.length < 1 ||
    url.hostname.length > MAX_RESOURCE_HOST_LENGTH
  ) {
    throw new InvalidPaymentResourceUrlError();
  }
  url.hostname = url.hostname.toLowerCase();
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  const redacted = url.toString();
  if (redacted.length > MAX_RESOURCE_URL_LENGTH) throw new InvalidPaymentResourceUrlError();
  return redacted;
}
