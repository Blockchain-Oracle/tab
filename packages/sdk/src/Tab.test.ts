import { afterEach, describe, expect, it, vi } from "vitest";

import { Tab, TabApiError } from "./Tab";

const secretKey = `sk_test_${"a".repeat(43)}`;
const payment = {
  amount: "5.250000",
  createdAt: "2026-07-16T12:00:00.000Z",
  currency: "USD",
  env: "test",
  failureReason: null,
  id: "11111111-1111-4111-8111-111111111111",
  intentUrl: "https://merchant.example.test/intent",
  livemode: false,
  payerAddress: null,
  payerType: "human",
  refCode: "TAB-REAK1234",
  reportedAt: null,
  reportedTransactionId: null,
  settledAt: null,
  status: "pending",
  token: {
    address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    chainId: 42161,
  },
};

describe("Tab secret-key client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("supports the decided one-argument constructor through TAB_API_BASE_URL", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ payments: [payment] }));
    vi.stubEnv("TAB_API_BASE_URL", "https://tab.example.test");
    vi.stubGlobal("fetch", request);

    const tab = new Tab(secretKey);

    await expect(tab.payments.list()).resolves.toEqual([payment]);
    expect(request).toHaveBeenCalledWith(
      "https://tab.example.test/api/v1/payments?limit=20",
      expect.objectContaining({ headers: { authorization: `Bearer ${secretKey}` } }),
    );
  });

  it("lists and retrieves payments through the real secret-key API contract", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ payments: [payment] }))
      .mockResolvedValueOnce(Response.json({ payment }));
    const tab = new Tab(secretKey, { apiBaseUrl: "https://tab.example.test", request });

    await expect(tab.payments.list({ limit: 25 })).resolves.toEqual([payment]);
    await expect(tab.payments.retrieve(payment.id)).resolves.toEqual(payment);

    expect(request).toHaveBeenNthCalledWith(
      1,
      "https://tab.example.test/api/v1/payments?limit=25",
      expect.objectContaining({
        headers: { authorization: `Bearer ${secretKey}` },
        method: "GET",
      }),
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      `https://tab.example.test/api/v1/payments/${payment.id}`,
      expect.objectContaining({
        headers: { authorization: `Bearer ${secretKey}` },
        method: "GET",
      }),
    );
  });

  it("accepts a positive sub-dollar amount padded to six decimal places", async () => {
    const subDollarPayment = { ...payment, amount: "0.100000" };
    const tab = new Tab(secretKey, {
      apiBaseUrl: "https://tab.example.test",
      request: vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ payments: [subDollarPayment] })),
    });

    await expect(tab.payments.list()).resolves.toEqual([subDollarPayment]);
  });

  it("preserves structured API failures without exposing the secret", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { error: { code: "API_KEY_ENVIRONMENT_DENIED", message: "Environment denied." } },
          { status: 403 },
        ),
      );
    const tab = new Tab(secretKey, { apiBaseUrl: "https://tab.example.test", request });

    await expect(tab.payments.list()).rejects.toMatchObject({
      code: "API_KEY_ENVIRONMENT_DENIED",
      message: "Environment denied.",
      status: 403,
    });
    await expect(tab.payments.list()).rejects.not.toThrow(secretKey);
  });

  it.each([
    ["amount", { ...payment, amount: "0" }],
    ["zero-valued decimal amount", { ...payment, amount: "0.000000" }],
    ["numeric zero amount", { ...payment, amount: 0 }],
    ["date", { ...payment, createdAt: "yesterday" }],
    ["identifier", { ...payment, id: "payment_123" }],
    ["token network", { ...payment, token: { ...payment.token, chainId: 8453 } }],
    ["status evidence", { ...payment, status: "settled" }],
  ])("rejects invalid %s response semantics", async (_label, invalidPayment) => {
    const tab = new Tab(secretKey, {
      apiBaseUrl: "https://tab.example.test",
      request: vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ payments: [invalidPayment] })),
    });

    await expect(tab.payments.list()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("fails closed for invalid configuration and malformed server responses", async () => {
    expect(() => new Tab("masked-secret", { apiBaseUrl: "https://tab.example.test" })).toThrow(
      TabApiError,
    );
    expect(() => new Tab(secretKey, { apiBaseUrl: "http://tab.example.test" })).toThrow(
      TabApiError,
    );
    expect(() => new Tab(secretKey, { apiBaseUrl: "https://tab.example.test/private" })).toThrow(
      TabApiError,
    );
    expect(() => new Tab(secretKey)).toThrow(TabApiError);

    const tab = new Tab(secretKey, {
      apiBaseUrl: "http://localhost:3000",
      request: vi.fn<typeof fetch>().mockResolvedValue(Response.json({ payments: "wrong" })),
    });
    await expect(tab.payments.list()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });

    const semanticallyInvalid = new Tab(secretKey, {
      apiBaseUrl: "http://localhost:3000",
      request: vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ payments: [{ ...payment, env: "live" }] })),
    });
    await expect(semanticallyInvalid.payments.list()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
});
