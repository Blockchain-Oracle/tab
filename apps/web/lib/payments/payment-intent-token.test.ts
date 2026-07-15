import { randomUUID } from "node:crypto";

import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import {
  InvalidPaymentIntentTokenError,
  PaymentIntentConfigurationError,
  signPaymentIntentToken,
  verifyPaymentIntentToken,
} from "./payment-intent-token";

const secret = "integration-payment-intent-secret-32-bytes-minimum";
const now = new Date("2026-07-15T12:00:00Z");

function claims() {
  return {
    amountUsd: "5.250000",
    env: "test" as const,
    intentUrl: "https://merchant.example.test/intent",
    jti: randomUUID(),
    merchantId: randomUUID(),
    receiver: "0x1111111111111111111111111111111111111111",
  };
}

describe("signed payment intents", () => {
  it("round-trips authoritative claims through a real HS256 signature", async () => {
    const input = claims();
    const token = await signPaymentIntentToken(input, { now, secret });

    await expect(verifyPaymentIntentToken(token, { now, secret })).resolves.toEqual({
      ...input,
      currency: "USD",
      expiresAt: new Date("2026-07-15T12:05:00.000Z"),
      tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      tokenChainId: 42161,
    });
  });

  it("fails closed for tampering, expiry, and the wrong signing secret", async () => {
    const token = await signPaymentIntentToken(claims(), { now, secret });
    const [header, payload, signature] = token.split(".");
    const tampered = `${header}.${payload?.slice(0, -1)}A.${signature}`;

    await expect(verifyPaymentIntentToken(tampered, { now, secret })).rejects.toBeInstanceOf(
      InvalidPaymentIntentTokenError,
    );
    await expect(
      verifyPaymentIntentToken(token, {
        now: new Date("2026-07-15T12:06:00Z"),
        secret,
      }),
    ).rejects.toBeInstanceOf(InvalidPaymentIntentTokenError);
    await expect(
      verifyPaymentIntentToken(token, { now, secret: `${secret}-different` }),
    ).rejects.toBeInstanceOf(InvalidPaymentIntentTokenError);
  });

  it("rejects future-issued and noncanonical-lifetime tokens", async () => {
    const tolerated = await signPaymentIntentToken(claims(), {
      now: new Date("2026-07-15T12:00:04Z"),
      secret,
    });
    await expect(verifyPaymentIntentToken(tolerated, { now, secret })).resolves.toMatchObject({
      env: "test",
    });

    const futureToken = await signPaymentIntentToken(claims(), {
      now: new Date("2026-07-15T12:01:00Z"),
      secret,
    });
    await expect(verifyPaymentIntentToken(futureToken, { now, secret })).rejects.toBeInstanceOf(
      InvalidPaymentIntentTokenError,
    );

    const input = claims();
    const issuedAt = Math.floor(now.getTime() / 1_000);
    const longLived = await new SignJWT({
      amountUsd: input.amountUsd,
      currency: "USD",
      env: input.env,
      intentUrl: input.intentUrl,
      receiver: input.receiver,
      tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      tokenChainId: 42161,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer("tab")
      .setAudience("tab-checkout")
      .setSubject(input.merchantId)
      .setJti(input.jti)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 3_600)
      .sign(new TextEncoder().encode(secret));

    await expect(verifyPaymentIntentToken(longLived, { now, secret })).rejects.toBeInstanceOf(
      InvalidPaymentIntentTokenError,
    );
  });

  it("rejects missing or undersized signing configuration", async () => {
    await expect(signPaymentIntentToken(claims(), { now, secret: "short" })).rejects.toBeInstanceOf(
      PaymentIntentConfigurationError,
    );
    await expect(signPaymentIntentToken(claims(), { now, secret: "" })).rejects.toBeInstanceOf(
      PaymentIntentConfigurationError,
    );
  });

  it("refuses to sign invalid authority claims", async () => {
    await expect(
      signPaymentIntentToken({ ...claims(), amountUsd: "1e2" }, { now, secret }),
    ).rejects.toBeInstanceOf(InvalidPaymentIntentTokenError);
    await expect(
      signPaymentIntentToken(
        { ...claims(), receiver: "0x0000000000000000000000000000000000000000" },
        { now, secret },
      ),
    ).rejects.toBeInstanceOf(InvalidPaymentIntentTokenError);
  });
});
