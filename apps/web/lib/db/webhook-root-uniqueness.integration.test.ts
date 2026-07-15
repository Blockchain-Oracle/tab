import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  insertWebhookTestDelivery,
  webhookSchemaSql as sql,
  webhookTestEndpoint,
  webhookTestMerchant,
  webhookTestSettlement,
} from "./webhook-schema-test-support";

beforeEach(async () => {
  await sql`truncate table users cascade`;
});

afterAll(async () => {
  await sql.end();
});

describe("automatic webhook root identity with real PostgreSQL", () => {
  it("allows only one automatic root per settlement across endpoint replacement", async () => {
    const merchantId = await webhookTestMerchant("webhook-root");
    const firstEndpointId = await webhookTestEndpoint(merchantId);
    const evidence = await webhookTestSettlement(merchantId);
    const firstId = randomUUID();
    await insertWebhookTestDelivery({
      ...evidence,
      endpointId: firstEndpointId,
      id: firstId,
      merchantId,
      retryChainId: firstId,
    });
    await sql`
      update webhook_endpoints set deleted_at = now(), secret_ciphertext = null,
        secret_nonce = null, secret_auth_tag = null, secret_key_version = null
      where id = ${firstEndpointId}
    `;
    const replacementEndpointId = await webhookTestEndpoint(merchantId);
    const replacementId = randomUUID();

    await expect(
      insertWebhookTestDelivery({
        ...evidence,
        endpointId: replacementEndpointId,
        id: replacementId,
        merchantId,
        retryChainId: replacementId,
      }),
    ).rejects.toMatchObject({ code: "23505" });
  });
});
