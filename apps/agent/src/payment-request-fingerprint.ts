import { createHash } from "node:crypto";

const MAX_PAYMENT_REQUEST_BODY_BYTES = 1_048_576;
const IGNORED_HEADERS = new Set([
  "access-control-expose-headers",
  "payment-signature",
  "x-payment",
]);

export class PaymentRequestFingerprintError extends Error {
  readonly code = "INVALID_FETCH_REQUEST";

  constructor() {
    super("The fetch request is invalid.");
    this.name = "PaymentRequestFingerprintError";
  }
}

function part(hash: ReturnType<typeof createHash>, value: string) {
  hash.update(String(Buffer.byteLength(value)));
  hash.update(":");
  hash.update(value);
  hash.update(";");
}

export async function fingerprintPaymentRequest(request: Request) {
  const hash = createHash("sha256");
  part(hash, request.method.toUpperCase());
  part(hash, request.url);
  const headers = [...request.headers]
    .filter(([name]) => !IGNORED_HEADERS.has(name.toLowerCase()))
    .sort(([left], [right]) => left.localeCompare(right));
  for (const [name, value] of headers) {
    part(hash, name.toLowerCase());
    part(hash, value);
  }
  const body = request.body;
  if (body) {
    const reader = body.getReader();
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_PAYMENT_REQUEST_BODY_BYTES) {
          void reader.cancel().catch(() => undefined);
          throw new PaymentRequestFingerprintError();
        }
        hash.update(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  return hash.digest("hex");
}
