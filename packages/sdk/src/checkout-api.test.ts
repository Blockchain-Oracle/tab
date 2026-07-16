import { describe, expect, it, vi } from "vitest";

import {
  assertOpenedPaymentMatchesIntent,
  loadCheckoutContext,
  loadMerchantIntent,
  openPayment,
  reportPayment,
} from "./checkout-api";

const intentResponse = {
  intent: {
    amount: "12.00",
    currency: "USD" as const,
    mode: "test" as const,
    receiver: "0x1111111111111111111111111111111111111111",
    token: {
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      chainId: 42161 as const,
    },
  },
  intentToken: "signed.intent.token",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

describe("checkout API client", () => {
  it("loads real merchant chrome and public integration configuration with the publishable key", async () => {
    const body = {
      capabilities: { livePaymentExecution: false },
      clientConfig: {
        magicPublishableKey: "pk_live_magic_public",
        particle: {
          projectAppUuid: "particle-app",
          projectClientKey: "particle-client",
          projectId: "particle-project",
        },
      },
      merchant: { businessName: "Confirmed Merchant", logoUrl: null },
      mode: "test",
    };
    const request = vi.fn().mockResolvedValue(jsonResponse(body));

    await expect(
      loadCheckoutContext(
        { apiBaseUrl: "https://tab.example.test", publishableKey: "pk_test_browser_key" },
        { request },
      ),
    ).resolves.toEqual(body);
    expect(request).toHaveBeenCalledWith(
      "https://tab.example.test/api/v1/checkout-context",
      expect.objectContaining({
        headers: { authorization: "Bearer pk_test_browser_key" },
        method: "GET",
      }),
    );
  });

  it("loads the displayed amount from the merchant's signed intent response", async () => {
    const request = vi.fn().mockResolvedValue(jsonResponse(intentResponse));

    await expect(
      loadMerchantIntent("https://merchant.example.test/api/payment-intent", { request }),
    ).resolves.toEqual(intentResponse);

    expect(request).toHaveBeenCalledWith(
      "https://merchant.example.test/api/payment-intent",
      expect.objectContaining({ cache: "no-store", method: "GET" }),
    );
  });

  it("opens a payment with only the signed token and publishable key", async () => {
    const openedPayment = {
      payment: {
        amount: intentResponse.intent.amount,
        currency: intentResponse.intent.currency,
        env: "test",
        livemode: false,
        receiver: intentResponse.intent.receiver,
        status: "pending",
        token: intentResponse.intent.token,
      },
      paymentId: "1d15cc1f-30a7-4f28-9d33-b93f4fd806aa",
      refCode: "TAB-2J7VNW4Q",
    };
    const request = vi.fn().mockResolvedValue(jsonResponse(openedPayment));

    await expect(
      openPayment(
        {
          apiBaseUrl: "https://tab.example.test/",
          intentToken: intentResponse.intentToken,
          publishableKey: "pk_test_browser_key",
        },
        { request },
      ),
    ).resolves.toEqual(openedPayment);

    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://tab.example.test/api/v1/payments");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      authorization: "Bearer pk_test_browser_key",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(init.body))).toEqual({ intentToken: "signed.intent.token" });
  });

  it("rejects malformed opened-payment authority data", async () => {
    const request = vi.fn().mockResolvedValue(
      jsonResponse({
        payment: { ...intentResponse.intent, env: "test", livemode: true, status: "pending" },
        paymentId: "not-a-payment-id",
        refCode: "TAB-2J7VNW4Q",
      }),
    );

    await expect(
      openPayment(
        {
          apiBaseUrl: "https://tab.example.test",
          intentToken: intentResponse.intentToken,
          publishableKey: "pk_test_browser_key",
        },
        { request },
      ),
    ).rejects.toMatchObject({ code: "INVALID_PAYMENT_RESPONSE" });
  });

  it("rejects a payment row that does not match the signed intent", () => {
    expect(() =>
      assertOpenedPaymentMatchesIntent(
        {
          payment: {
            amount: "13.00",
            currency: "USD",
            env: "test",
            livemode: false,
            receiver: intentResponse.intent.receiver,
            status: "pending",
            token: intentResponse.intent.token,
          },
          paymentId: "1d15cc1f-30a7-4f28-9d33-b93f4fd806aa",
          refCode: "TAB-2J7VNW4Q",
        },
        intentResponse.intent,
      ),
    ).toThrowError(expect.objectContaining({ code: "PAYMENT_INTENT_CONFLICT" }));
  });

  it("reports a real execution with the buyer DID and one normalized change record", async () => {
    const responseBody = {
      payment: {
        id: "1d15cc1f-30a7-4f28-9d33-b93f4fd806aa",
        reportedTransactionId: "particle-transaction-id",
        status: "pending",
        verification: { method: null, verifiedAt: null },
      },
      verification: {
        code: "LIVE_SETTLEMENT_VERIFICATION_BLOCKED",
        message: "Live payment evidence was recorded.",
      },
    };
    const request = vi.fn().mockResolvedValue(jsonResponse(responseBody, 202));

    await expect(
      reportPayment(
        {
          apiBaseUrl: "https://tab.example.test",
          buyerDidToken: "buyer.did.token",
          paymentId: "1d15cc1f-30a7-4f28-9d33-b93f4fd806aa",
          publishableKey: "pk_live_browser_key",
          tokenChanges: { totalPaidAmountInUSD: "12.00" },
          transactionId: "particle-transaction-id",
        },
        { request },
      ),
    ).resolves.toEqual(responseBody);

    const [url, init] = request.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://tab.example.test/api/v1/payments/1d15cc1f-30a7-4f28-9d33-b93f4fd806aa",
    );
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({
      buyerDidToken: "buyer.did.token",
      tokenChanges: [{ totalPaidAmountInUSD: "12.00" }],
      transactionId: "particle-transaction-id",
    });
  });
});
