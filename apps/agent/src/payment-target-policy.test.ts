import { describe, expect, it } from "vitest";

import {
  PaymentTargetPolicyError,
  safePaymentRequestInit,
  validatePaymentTarget,
} from "./payment-target-policy.js";

describe("payment target policy", () => {
  it("requires HTTPS for remote payment resources", () => {
    expect(validatePaymentTarget("https://seller.example/pay")).toBe("https://seller.example/pay");
    for (const target of [
      "http://seller.example/pay",
      "http://10.0.0.4/pay",
      "https://192.168.1.4/pay",
      "https://169.254.169.254/latest/meta-data",
      "https://metadata.google.internal/computeMetadata/v1",
      "https://service.local/pay",
    ]) {
      expect(() => validatePaymentTarget(target)).toThrow(PaymentTargetPolicyError);
    }
  });

  it("rejects loopback by default and permits it only with the explicit development flag", () => {
    for (const target of [
      "http://127.0.0.1:8787/pay",
      "http://127.44.55.66:8787/pay",
      "http://[::1]:8787/pay",
      "http://localhost:8787/pay",
    ]) {
      expect(() => validatePaymentTarget(target)).toThrow(PaymentTargetPolicyError);
      expect(validatePaymentTarget(target, { allowDevelopmentLoopback: true })).toBe(target);
    }
  });

  it("forbids target credentials and redirect-following", () => {
    expect(() => validatePaymentTarget("https://user:secret@seller.example/pay")).toThrow(
      PaymentTargetPolicyError,
    );
    expect(safePaymentRequestInit({ method: "POST", redirect: "follow" })).toEqual({
      method: "POST",
      redirect: "error",
    });
  });
});
