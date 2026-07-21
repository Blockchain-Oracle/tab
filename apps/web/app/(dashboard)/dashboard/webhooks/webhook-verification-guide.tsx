import { CodeBlock } from "../../../../components/code-block";
import styles from "./webhook-verification-guide.module.css";

export const WEBHOOK_SIGNATURE_HEADER_SHAPE =
  "X-Tab-Signature: t=<unix_seconds>,v1=<64 lowercase hex characters>";

export const WEBHOOK_PAYMENT_PAYLOAD_SHAPE =
  '{"id":"<delivery UUID>","type":"payment.settled","livemode":true,"transactionId":"<transaction ID>","tokenChanges":[...]}';

const eventKeyExpression = `$${"{event.type}"}:$${"{event.id}"}`;
const timestampExpression = `$${"{timestamp}"}`;

export const WEBHOOK_IDEMPOTENCY_GUIDANCE = `After verifying and parsing, build the idempotency key \`${eventKeyExpression}\`. The payload id is the delivery UUID; retries and manual resends preserve it. Insert that key under a unique constraint and fulfill the order in the same database transaction. Return 2xx for an already-processed valid event.`;

export const WEBHOOK_VERIFIER_SNIPPET = [
  'import { createHmac, timingSafeEqual } from "node:crypto";',
  "",
  "const MAX_AGE_SECONDS = 300;",
  "const MAX_FUTURE_SKEW_SECONDS = 30;",
  "",
  "export function verifyTabSignature(rawBody: Buffer, header: string, secret: string) {",
  "  const match = /^t=([0-9]+),v1=([0-9a-f]{64})$/.exec(header);",
  "  if (!match) return false;",
  "  const timestamp = Number(match[1]);",
  "  const now = Math.floor(Date.now() / 1000);",
  "  if (!Number.isSafeInteger(timestamp)",
  "    || timestamp < now - MAX_AGE_SECONDS",
  "    || timestamp > now + MAX_FUTURE_SKEW_SECONDS) return false;",
  '  const expected = createHmac("sha256", secret)',
  `    .update(\`${timestampExpression}.\`, "utf8")`,
  "    .update(rawBody)",
  "    .digest();",
  '  const supplied = Buffer.from(match[2], "hex");',
  "  return supplied.length === expected.length",
  "    && timingSafeEqual(supplied, expected);",
  "}",
].join("\n");

export function WebhookVerificationGuide() {
  return (
    <section aria-labelledby="webhook-verification-title" className={styles.guide}>
      <h2 id="webhook-verification-title">Verify every delivery</h2>
      <p>
        Anyone can POST to your endpoint — the <code>X-Tab-Signature</code> header is how your
        server knows a delivery really came from Tab. Check it with your one-time{" "}
        <code>whsec_</code> signing secret before trusting the payload.
      </p>
      <details className={styles.verifierDetails}>
        <summary>Node.js verifier — copy into your webhook handler</summary>
        <code className={styles.contract}>{WEBHOOK_SIGNATURE_HEADER_SHAPE}</code>
        <CodeBlock code={WEBHOOK_VERIFIER_SNIPPET} lang="ts" />
      </details>
      <h3>Payload and idempotency</h3>
      <code className={styles.contract}>{WEBHOOK_PAYMENT_PAYLOAD_SHAPE}</code>
      <p>{WEBHOOK_IDEMPOTENCY_GUIDANCE}</p>
      <p>
        <code>transactionId</code> is settlement evidence, not the delivery idempotency key. Test
        deliveries use the smaller shape{" "}
        <code>{'{"id":"<delivery UUID>","type":"test","livemode":false}'}</code>.
      </p>
    </section>
  );
}
