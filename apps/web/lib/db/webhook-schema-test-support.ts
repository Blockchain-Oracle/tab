import { createHash, randomUUID } from "node:crypto";

import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for webhook schema tests");

export const webhookSchemaSql = postgres(databaseUrl, { max: 1 });

export const unsafeWebhookEndpointUrls = [
  "http://127.0.0.1:3000/webhook",
  "https://",
  "https://localhost/webhook",
  "https://127.0.0.1/webhook",
  "https://10.0.0.1/webhook",
  "https://192.168.1.1/webhook",
  "https://169.254.169.254/webhook",
  "https://172.31.255.255/webhook",
  "https://[fc00::1]/webhook",
] as const;

export async function schemaTables() {
  const rows = await webhookSchemaSql<{ table_name: string }[]>`
    select table_name from information_schema.tables
    where table_schema = 'public'
      and table_name in ('webhook_deliveries', 'webhook_endpoints')
    order by table_name
  `;
  return rows.map((row) => row.table_name);
}

export async function webhookTestMerchant(label: string) {
  const [user] = await webhookSchemaSql<{ id: string }[]>`
    insert into users (email, magic_issuer)
    values (${`${label}-${randomUUID()}@example.test`}, ${`did:ethr:${randomUUID()}`})
    returning id
  `;
  if (!user) throw new Error("Expected a user row");
  const [row] = await webhookSchemaSql<{ id: string }[]>`
    insert into merchants (user_id, receiving_address)
    values (${user.id}, '0x1111111111111111111111111111111111111111') returning id
  `;
  if (!row) throw new Error("Expected a merchant row");
  return row.id;
}

export function insertWebhookTestEndpoint(
  merchantId: string,
  env: "live" | "test" = "test",
  url = "https://merchant.example.test/webhook",
) {
  return webhookSchemaSql<{ id: string }[]>`
    insert into webhook_endpoints (
      merchant_id, env, url, secret_ciphertext, secret_nonce,
      secret_auth_tag, secret_key_version, secret_last4
    ) values (
      ${merchantId}, ${env}, ${url}, 'ciphertext',
      'AAAAAAAAAAAAAAAA', 'AAAAAAAAAAAAAAAAAAAAAA', 1, 'last'
    ) returning id
  `;
}

export async function webhookTestEndpoint(merchantId: string, env: "live" | "test" = "test") {
  const [row] = await insertWebhookTestEndpoint(merchantId, env);
  if (!row) throw new Error("Expected a webhook endpoint");
  return row.id;
}

export async function webhookTestSettlement(merchantId: string, env: "live" | "test" = "test") {
  const transactionId = `test_${randomUUID()}`;
  const [payment] = await webhookSchemaSql<{ id: string }[]>`
    insert into payments (
      merchant_id, ref_code, env, livemode, amount_usd, currency, receiver,
      token_address, token_chain_id, intent_url, status, reported_transaction_id,
      reported_token_changes, reported_at, settled_at
    ) values (
      ${merchantId}, ${`TAB-${randomUUID().slice(0, 8).toUpperCase()}`}, ${env}, ${env === "live"},
      '1.000000', 'USD', '0x1111111111111111111111111111111111111111',
      '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', 42161,
      'https://merchant.example.test/intent', 'settled', ${transactionId}, '[]', now(), now()
    ) returning id
  `;
  if (!payment) throw new Error("Expected a payment row");
  const [row] = await webhookSchemaSql<{ id: string }[]>`
    insert into settlements (
      payment_id, particle_transaction_id, token_changes_json, amount_atomic,
      verification_method, verification_trigger, livemode
    ) values (
      ${payment.id}, ${transactionId}, '[]', '1000000',
      ${env === "live" ? "rpc" : "simulated_test"}, 'inline', ${env === "live"}
    )
    returning id
  `;
  if (!row) throw new Error("Expected a settlement row");
  return { paymentId: payment.id, settlementId: row.id };
}

export type WebhookTestDeliveryInput = {
  attempt?: number;
  endpointId: string;
  env?: "live" | "test";
  eventId?: string;
  id?: string;
  merchantId: string;
  parentDeliveryId?: string;
  parentAttempt?: number;
  paymentId?: string | null;
  requestBody?: string;
  retryChainId?: string;
  settlementId?: string | null;
  trigger?: "auto" | "manual";
  type?: "payment" | "test";
};

export function insertWebhookTestDelivery(input: WebhookTestDeliveryInput) {
  const id = input.id ?? randomUUID();
  const requestBody = input.requestBody ?? "{}";
  return webhookSchemaSql`
    insert into webhook_deliveries (
      id, endpoint_id, merchant_id, env, payment_id, settlement_id, event_id,
      retry_chain_id, type, trigger, attempt, result, request_body, parent_delivery_id,
      parent_attempt
    ) values (
      ${id}, ${input.endpointId}, ${input.merchantId}, ${input.env ?? "test"},
      ${input.paymentId ?? null}, ${input.settlementId ?? null},
      ${input.eventId ?? `evt_${randomUUID().replaceAll("-", "")}`},
      ${input.retryChainId ?? id}, ${input.type ?? "payment"}, ${input.trigger ?? "auto"},
      ${input.attempt ?? 1}, 'pending', ${requestBody}, ${input.parentDeliveryId ?? null},
      ${input.parentAttempt ?? (input.attempt && input.attempt > 1 ? input.attempt - 1 : null)}
    ) returning id
  `;
}

export async function insertManualWebhookRetryChain(input: WebhookTestDeliveryInput) {
  if (!input.id) throw new Error("Expected the automatic root id");
  const manualRootId = randomUUID();
  await insertWebhookTestDelivery({
    ...input,
    id: manualRootId,
    parentDeliveryId: input.id,
    retryChainId: manualRootId,
    trigger: "manual",
  });
  const manualRetryId = randomUUID();
  await insertWebhookTestDelivery({
    ...input,
    attempt: 2,
    id: manualRetryId,
    parentDeliveryId: manualRootId,
    retryChainId: manualRootId,
    trigger: "manual",
  });
  return manualRetryId;
}

export function insertWebhookTestDeliveryWithSuppliedHash(input: {
  endpointId: string;
  eventId: string;
  merchantId: string;
  paymentId: string;
  retryChainId: string;
  settlementId: string;
}) {
  return webhookSchemaSql`
    insert into webhook_deliveries (
      id, endpoint_id, merchant_id, env, payment_id, settlement_id, event_id,
      retry_chain_id, request_body_hash, type, trigger, attempt, result,
      request_body, parent_delivery_id, parent_attempt
    ) values (
      ${randomUUID()}, ${input.endpointId}, ${input.merchantId}, 'test', ${input.paymentId},
      ${input.settlementId}, ${input.eventId}, ${input.retryChainId},
      ${createHash("sha256").update("{}").digest("hex")}, 'payment', 'auto', 2,
      'pending', '{"changed":true}', ${input.retryChainId}, 1
    )
  `;
}
