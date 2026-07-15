import { describe, expect, it } from "vitest";

import { signWebhookPayload } from "./signature";

describe("X-Tab-Signature", () => {
  it("matches the fixed HMAC-SHA256 contract vector", () => {
    const body =
      '{"id":"evt_unit_1","type":"payment.settled","livemode":false,"transactionId":"test_tx_unit_1","tokenChanges":[]}';

    expect(
      signWebhookPayload(body, "whsec_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG", 1_700_000_000),
    ).toBe("t=1700000000,v1=60232c5e10bd0dfeb55268c8a70bcb6389163b1f2db86ea25be9e42fa0e141d7");
  });

  it("signs the exact raw bytes and rejects invalid timestamps", () => {
    const secret = `whsec_${"a".repeat(43)}`;
    const compact = signWebhookPayload('{"ok":true}', secret, 1_700_000_001);
    const spaced = signWebhookPayload('{"ok": true}', secret, 1_700_000_001);

    expect(compact).not.toBe(spaced);
    expect(() => signWebhookPayload("{}", secret, -1)).toThrow();
    expect(() => signWebhookPayload("{}", secret, 1.5)).toThrow();
    expect(() => signWebhookPayload("{}", "whsec_short", 1_700_000_001)).toThrow();
  });
});
