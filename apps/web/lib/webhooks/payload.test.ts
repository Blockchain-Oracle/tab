import { describe, expect, it } from "vitest";

import { createWebhookEventId, serializePaymentSettledPayload } from "./payload";

const deliveryId = "11111111-1111-4111-8111-111111111111";

describe("payment.settled webhook payload", () => {
  it("matches the exact compact byte contract and fixed top-level key order", () => {
    const rawBody = serializePaymentSettledPayload({
      id: deliveryId,
      livemode: false,
      tokenChanges: [{ amount: "7000000", chainId: 42161 }],
      transactionId: "test_tx_unit_1",
    });

    expect(rawBody).toBe(
      '{"id":"11111111-1111-4111-8111-111111111111","type":"payment.settled","livemode":false,"transactionId":"test_tx_unit_1","tokenChanges":[{"amount":"7000000","chainId":42161}]}',
    );
  });

  it("recursively sorts object keys without changing array order or mutating evidence", () => {
    const tokenChanges = [
      {
        zeta: { z: 2, a: 1 },
        alpha: [{ second: "b", first: "a" }, null, [3, 1, 2]],
      },
      { sequence: 2 },
    ];
    const before = structuredClone(tokenChanges);

    const rawBody = serializePaymentSettledPayload({
      id: deliveryId,
      livemode: true,
      tokenChanges,
      transactionId: "tx_nested",
    });

    expect(rawBody).toBe(
      '{"id":"11111111-1111-4111-8111-111111111111","type":"payment.settled","livemode":true,"transactionId":"tx_nested","tokenChanges":[{"alpha":[{"first":"a","second":"b"},null,[3,1,2]],"zeta":{"a":1,"z":2}},{"sequence":2}]}',
    );
    expect(tokenChanges).toEqual(before);
  });

  it("creates a 24-byte base64url internal ledger event id", () => {
    const generated = createWebhookEventId();
    expect(generated).toMatch(/^evt_[A-Za-z0-9_-]{32}$/);
    expect(Buffer.from(generated.slice(4), "base64url")).toHaveLength(24);
  });

  it.each([
    ["undefined", [{ amount: undefined }]],
    ["bigint", [{ amount: BigInt(1) }]],
    ["non-finite number", [{ amount: Number.NaN }]],
    ["negative zero", [{ amount: -0 }]],
    ["function", [{ value: () => true }]],
    ["symbol", [{ value: Symbol("value") }]],
    ["non-plain object", [{ value: new Date(0) }]],
    ["sparse array", [{ values: new Array(1) }]],
  ])("rejects %s rather than silently changing it", (_name, tokenChanges) => {
    expect(() =>
      serializePaymentSettledPayload({
        id: deliveryId,
        livemode: false,
        tokenChanges,
        transactionId: "test_tx_invalid",
      }),
    ).toThrow("non-JSON");
  });

  it("rejects circular evidence and invalid envelope fields", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() =>
      serializePaymentSettledPayload({
        id: deliveryId,
        livemode: false,
        tokenChanges: [circular],
        transactionId: "test_tx_cycle",
      }),
    ).toThrow("non-JSON");

    expect(() =>
      serializePaymentSettledPayload({
        id: "delivery_1",
        livemode: false,
        tokenChanges: [],
        transactionId: "test_tx_invalid_id",
      }),
    ).toThrow("envelope");
  });
});
