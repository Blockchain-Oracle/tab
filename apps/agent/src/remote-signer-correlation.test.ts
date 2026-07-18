import { describe, expect, it, vi } from "vitest";

import { nowSeconds, signerWithFetch } from "./remote-signer.test-support.js";

describe("durable remote-signer correlation", () => {
  it("restores a persisted receipt after restart without contacting the signer provider", () => {
    const fetch = vi.fn(async () => Response.json({}));
    const signer = signerWithFetch(fetch);
    const signature = `0x${"12".repeat(65)}`;

    signer.restorePaymentCorrelation(signature, "receipt-persisted", nowSeconds - 1);

    expect(signer.receiptIdForSignature(signature)).toBe("receipt-persisted");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects malformed persisted correlation data", () => {
    const signer = signerWithFetch(async () => Response.json({}));
    for (const [signature, receiptId, validBefore] of [
      ["0x12", "receipt", nowSeconds],
      [`0x${"12".repeat(65)}`, "", nowSeconds],
      [`0x${"12".repeat(65)}`, "receipt", Number.NaN],
    ] as const) {
      expect(() => signer.restorePaymentCorrelation(signature, receiptId, validBefore)).toThrow(
        "persisted payment correlation is invalid",
      );
    }
  });
});
