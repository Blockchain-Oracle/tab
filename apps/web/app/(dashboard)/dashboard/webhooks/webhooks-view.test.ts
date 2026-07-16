import { describe, expect, it } from "vitest";

import { deliveryCode, deliverySubject, deliveryTone, mayResend } from "./webhooks-view";

const delivery = {
  eventId: "evt_realLedgerEvent",
  failureKind: null,
  request: { body: '{"id":"one","type":"test","livemode":false}' },
  response: { statusCode: 202 },
  result: "delivered",
  type: "test",
} as const;

describe("webhook delivery display derives only from stored evidence", () => {
  it("labels an honest test delivery without inventing a transaction hash", () => {
    expect(deliveryCode(delivery)).toBe("202");
    expect(deliverySubject(delivery)).toBe("Test event");
    expect(deliveryTone(delivery)).toEqual({ label: "Delivered", tone: "success" });
    expect(mayResend(delivery.result)).toBe(true);
  });

  it("uses the stored payment transaction id when one exists", () => {
    expect(
      deliverySubject({
        ...delivery,
        request: {
          body: '{"id":"one","type":"payment.settled","transactionId":"particle_real_123"}',
        },
        type: "payment",
      }),
    ).toBe("particle_real_123");
  });

  it("renders transport failures and prevents duplicate in-flight resend", () => {
    expect(
      deliveryCode({
        ...delivery,
        failureKind: "timeout",
        response: { statusCode: null },
      }),
    ).toBe("TIMEOUT");
    expect(mayResend("pending")).toBe(false);
    expect(mayResend("retrying")).toBe(false);
  });
});
