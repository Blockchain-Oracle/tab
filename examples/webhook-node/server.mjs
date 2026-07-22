// Minimal Tab webhook receiver: verify the signature on RAW bytes BEFORE
// parsing JSON, then fulfill idempotently. No framework required.
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const SECRET = process.env.TAB_WEBHOOK_SECRET; // whsec_… (printed once by setup-webhook)
const PORT = Number(process.env.PORT ?? 4100);
const MAX_AGE_SECONDS = 300;
const MAX_FUTURE_SKEW_SECONDS = 30;

const fulfilled = new Set(); // use a UNIQUE-constrained DB column in production

function verifyTabSignature(rawBody, header, secret) {
  const match = /^t=([0-9]+),v1=([0-9a-f]{64})$/.exec(header ?? "");
  if (!match) return false;
  const timestamp = Number(match[1]);
  const now = Math.floor(Date.now() / 1000);
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < now - MAX_AGE_SECONDS ||
    timestamp > now + MAX_FUTURE_SKEW_SECONDS
  ) {
    return false;
  }
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.`, "utf8")
    .update(rawBody)
    .digest();
  const supplied = Buffer.from(match[2], "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

createServer(async (request, response) => {
  if (request.method !== "POST") {
    response.writeHead(405).end();
    return;
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks);

  if (!verifyTabSignature(rawBody, request.headers["x-tab-signature"], SECRET)) {
    console.warn("✗ rejected delivery: bad signature");
    response.writeHead(400).end();
    return;
  }

  const event = JSON.parse(rawBody.toString("utf8"));
  const idempotencyKey = `${event.type}:${event.id}`;
  if (fulfilled.has(idempotencyKey)) {
    console.log(`↩ duplicate ${idempotencyKey} — already processed, 200`);
    response.writeHead(200).end();
    return;
  }

  fulfilled.add(idempotencyKey);
  if (event.type === "payment.settled") {
    console.log(`✓ payment settled — transaction ${event.transactionId} (fulfill the order here)`);
  } else {
    console.log(`✓ received ${event.type} delivery ${event.id}`);
  }
  response.writeHead(200).end();
}).listen(PORT, () => {
  console.log(`Tab webhook receiver listening on http://localhost:${PORT}`);
  if (!SECRET) console.warn("⚠ TAB_WEBHOOK_SECRET is not set — all deliveries will be rejected.");
});
