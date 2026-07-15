import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  webhookTestEndpoint as endpoint,
  insertWebhookTestDelivery as insertDelivery,
  insertManualWebhookRetryChain,
  insertWebhookTestDeliveryWithSuppliedHash,
  insertWebhookTestEndpoint,
  webhookTestMerchant as merchant,
  schemaTables,
  webhookTestSettlement as settlement,
  webhookSchemaSql as sql,
  unsafeWebhookEndpointUrls,
} from "./webhook-schema-test-support";

describe("webhook ledger schema with real PostgreSQL", () => {
  beforeEach(async () => {
    await sql`truncate table users cascade`;
  });

  afterAll(async () => {
    await sql.end();
  });

  it("creates the endpoint and per-attempt delivery tables", async () => {
    expect(await schemaTables()).toEqual(["webhook_deliveries", "webhook_endpoints"]);
  });

  it("enforces one active endpoint and a complete recoverable secret envelope", async () => {
    const merchantId = await merchant("webhook-endpoint");
    const endpointId = await endpoint(merchantId);
    await expect(endpoint(merchantId)).rejects.toMatchObject({ code: "23505" });
    for (const unsafeUrl of unsafeWebhookEndpointUrls) {
      await expect(insertWebhookTestEndpoint(merchantId, "live", unsafeUrl)).rejects.toMatchObject({
        code: "23514",
      });
    }
    await expect(
      sql`
        insert into webhook_endpoints (
          merchant_id, env, url, secret_ciphertext, secret_nonce,
          secret_key_version, secret_last4
        ) values (
          ${merchantId}, 'live', 'https://merchant.example.test/live', 'ciphertext',
          'AAAAAAAAAAAAAAAA', 1, 'last'
        )
      `,
    ).rejects.toMatchObject({ code: "23514" });

    await sql`
      update webhook_endpoints set deleted_at = now(), secret_ciphertext = null,
        secret_nonce = null, secret_auth_tag = null, secret_key_version = null
      where id = ${endpointId}
    `;
    await expect(endpoint(merchantId)).resolves.toEqual(expect.any(String));
  });

  it("binds attempts to tenant evidence and prevents duplicate automatic roots", async () => {
    const merchantId = await merchant("webhook-ledger");
    const otherMerchantId = await merchant("webhook-other");
    const endpointId = await endpoint(merchantId);
    const evidence = await settlement(merchantId);
    const alternateEvidence = await settlement(merchantId);
    const foreignEvidence = await settlement(otherMerchantId);
    const liveEvidence = await settlement(merchantId, "live");
    const rootId = randomUUID();
    const eventId = `evt_${randomUUID().replaceAll("-", "")}`;
    const root = { endpointId, eventId, id: rootId, merchantId, retryChainId: rootId, ...evidence };

    await expect(insertDelivery(root)).resolves.toHaveLength(1);
    await expect(
      insertWebhookTestDeliveryWithSuppliedHash({
        endpointId,
        eventId,
        merchantId,
        paymentId: evidence.paymentId,
        retryChainId: rootId,
        settlementId: evidence.settlementId,
      }),
    ).rejects.toMatchObject({ code: "428C9" });
    const duplicateRootId = randomUUID();
    await expect(
      insertDelivery({ ...root, id: duplicateRootId, retryChainId: duplicateRootId }),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(insertDelivery({ ...root, attempt: 4, id: randomUUID() })).rejects.toMatchObject({
      code: "23514",
    });
    await expect(
      insertDelivery({
        ...root,
        attempt: 2,
        id: randomUUID(),
        merchantId: otherMerchantId,
        parentDeliveryId: rootId,
      }),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      insertDelivery({ ...root, attempt: 3, id: randomUUID(), parentDeliveryId: rootId }),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      insertDelivery({
        ...root,
        ...alternateEvidence,
        attempt: 2,
        id: randomUUID(),
        parentDeliveryId: rootId,
      }),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      insertDelivery({
        ...root,
        attempt: 2,
        id: randomUUID(),
        parentDeliveryId: rootId,
        paymentId: foreignEvidence.paymentId,
        settlementId: foreignEvidence.settlementId,
      }),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      insertDelivery({
        ...root,
        ...liveEvidence,
        attempt: 2,
        id: randomUUID(),
        parentDeliveryId: rootId,
      }),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      insertDelivery({
        ...root,
        attempt: 2,
        id: randomUUID(),
        parentDeliveryId: rootId,
        requestBody: '{"changed":true}',
      }),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      insertDelivery({
        ...evidence,
        endpointId,
        eventId,
        id: randomUUID(),
        merchantId,
        parentDeliveryId: rootId,
        requestBody: '{"changed":true}',
        trigger: "manual",
      }),
    ).rejects.toMatchObject({ code: "23503" });
    const selfParentId = randomUUID();
    await expect(
      insertDelivery({
        ...root,
        id: selfParentId,
        parentDeliveryId: selfParentId,
        retryChainId: selfParentId,
        trigger: "manual",
      }),
    ).rejects.toMatchObject({ code: "23514" });
    const manualRetryId = await insertManualWebhookRetryChain(root);
    await expect(
      insertDelivery({ ...root, attempt: 3, id: randomUUID(), parentDeliveryId: manualRetryId }),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      insertDelivery({ endpointId, merchantId, settlementId: null, type: "payment" }),
    ).rejects.toMatchObject({ code: "23514" });

    const retryId = randomUUID();
    await insertDelivery({ ...root, attempt: 2, id: retryId, parentDeliveryId: rootId });
    await expect(
      insertDelivery({ ...root, attempt: 2, id: randomUUID(), parentDeliveryId: rootId }),
    ).rejects.toMatchObject({ code: "23505" });

    await expect(
      sql`
        update webhook_deliveries set result = 'gave_up', failure_kind = 'http',
          signature_header = ${`t=1,v1=${"a".repeat(64)}`}, status_code = 500,
          started_at = now(), completed_at = now(), response_time_ms = 1
        where id = ${rootId}
      `,
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      sql`
        update webhook_deliveries set result = 'failed', failure_kind = 'http',
          signature_header = ${`t=1,v1=${"a".repeat(64)}`}, status_code = 500,
          started_at = now(), completed_at = now(), response_time_ms = 1,
          superseded_by_id = ${rootId}
        where id = ${rootId}
      `,
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      sql`
        update webhook_deliveries set result = 'delivered', status_code = 204,
          started_at = now(), completed_at = now(), response_time_ms = 1
        where id = ${rootId}
      `,
    ).rejects.toMatchObject({ code: "23514" });
  });
});
