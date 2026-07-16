import { describe, expect, it } from "vitest";

import {
  WEBHOOK_IDEMPOTENCY_GUIDANCE,
  WEBHOOK_PAYMENT_PAYLOAD_SHAPE,
  WEBHOOK_SIGNATURE_HEADER_SHAPE,
  WEBHOOK_VERIFIER_SNIPPET,
} from "./webhook-verification-guide";

describe("merchant webhook verification guide", () => {
  it("documents the exact header, raw-byte HMAC, and constant-time comparison", () => {
    const timestampExpression = `$${"{timestamp}"}`;
    expect(WEBHOOK_SIGNATURE_HEADER_SHAPE).toBe(
      "X-Tab-Signature: t=<unix_seconds>,v1=<64 lowercase hex characters>",
    );
    expect(WEBHOOK_VERIFIER_SNIPPET).toContain('createHmac("sha256", secret)');
    expect(WEBHOOK_VERIFIER_SNIPPET).toContain(`.update(\`${timestampExpression}.\`, "utf8")`);
    expect(WEBHOOK_VERIFIER_SNIPPET).toContain(".update(rawBody)");
    expect(WEBHOOK_VERIFIER_SNIPPET).toContain("timingSafeEqual(supplied, expected)");
    expect(WEBHOOK_VERIFIER_SNIPPET).not.toContain("JSON.stringify");
  });

  it("pins replay bounds and the transmitted delivery idempotency key", () => {
    const eventKeyExpression = `$${"{event.type}"}:$${"{event.id}"}`;
    expect(WEBHOOK_VERIFIER_SNIPPET).toContain("MAX_AGE_SECONDS = 300");
    expect(WEBHOOK_VERIFIER_SNIPPET).toContain("MAX_FUTURE_SKEW_SECONDS = 30");
    expect(WEBHOOK_PAYMENT_PAYLOAD_SHAPE).toContain(
      '"id":"<delivery UUID>","type":"payment.settled"',
    );
    expect(WEBHOOK_PAYMENT_PAYLOAD_SHAPE).toContain('"transactionId"');
    expect(WEBHOOK_PAYMENT_PAYLOAD_SHAPE).toContain('"tokenChanges"');
    expect(WEBHOOK_IDEMPOTENCY_GUIDANCE).toContain(`\`${eventKeyExpression}\``);
    expect(WEBHOOK_IDEMPOTENCY_GUIDANCE).toContain("retries and manual resends");
    expect(WEBHOOK_IDEMPOTENCY_GUIDANCE).toContain("same database transaction");
  });
});
