import { describe, expect, it } from "vitest";

import {
  fingerprintPaymentRequest,
  PaymentRequestFingerprintError,
} from "./payment-request-fingerprint.js";

describe("payment request fingerprint", () => {
  it("is stable across header order and changes for request semantics", async () => {
    const first = new Request("https://seller.example/pay?item=1", {
      body: "same body",
      headers: { "x-b": "2", "x-a": "1" },
      method: "POST",
    });
    const same = new Request("https://seller.example/pay?item=1", {
      body: "same body",
      headers: { "x-a": "1", "x-b": "2" },
      method: "POST",
    });
    const changed = new Request("https://seller.example/pay?item=1", {
      body: "different body",
      headers: { "x-a": "1", "x-b": "2" },
      method: "POST",
    });

    await expect(fingerprintPaymentRequest(first)).resolves.toBe(
      await fingerprintPaymentRequest(same),
    );
    await expect(fingerprintPaymentRequest(changed)).resolves.not.toBe(
      await fingerprintPaymentRequest(same),
    );
  });

  it("ignores protocol payment headers and bounds request bodies", async () => {
    const base = new Request("https://seller.example/pay");
    const paid = new Request(base, { headers: { "payment-signature": "secret-envelope" } });
    await expect(fingerprintPaymentRequest(paid)).resolves.toBe(
      await fingerprintPaymentRequest(base),
    );

    const oversized = new Request("https://seller.example/pay", {
      body: "x".repeat(1_048_577),
      method: "POST",
    });
    await expect(fingerprintPaymentRequest(oversized)).rejects.toBeInstanceOf(
      PaymentRequestFingerprintError,
    );
  });

  it("rejects an oversized cloned request without waiting for the tee sibling", async () => {
    const original = new Request("https://seller.example/pay", {
      body: "x".repeat(1_048_577),
      method: "POST",
    });
    const cloned = original.clone();

    const result = await Promise.race([
      fingerprintPaymentRequest(cloned).then(
        () => "resolved",
        (error: unknown) => error,
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve("timed-out"), 1_000)),
    ]);

    expect(result).toBeInstanceOf(PaymentRequestFingerprintError);
    await original.body?.cancel();
  });
});
