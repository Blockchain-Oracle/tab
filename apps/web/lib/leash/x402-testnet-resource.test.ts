import { decodePaymentRequiredHeader } from "@x402/core/http";
import type { FacilitatorClient, HTTPAdapter } from "@x402/core/server";
import type { SettleResponse, SupportedResponse, VerifyResponse } from "@x402/core/types";
import { describe, expect, it } from "vitest";
import {
  BASE_SEPOLIA_USDC,
  buildX402TestnetHttpServer,
  normalizeX402TestnetSettlement,
  readX402TestnetResourceConfig,
  TEST_FUNDS_LABEL,
  X402_TESTNET_AMOUNT,
  X402_TESTNET_FACILITATOR,
  X402_TESTNET_NETWORK,
  X402_TESTNET_PATH,
} from "./x402-testnet-resource";

const PAYEE = "0x1000000000000000000000000000000000000001";
const PAYER = "0x2000000000000000000000000000000000000002";

class TestFacilitator implements FacilitatorClient {
  async getSupported(): Promise<SupportedResponse> {
    return {
      extensions: [],
      kinds: [
        {
          extra: {},
          network: X402_TESTNET_NETWORK,
          scheme: "exact",
          x402Version: 2,
        },
      ],
      signers: {},
    };
  }

  async verify(): Promise<VerifyResponse> {
    throw new Error("An unpaid request must not be verified.");
  }

  async settle(): Promise<SettleResponse> {
    throw new Error("An unpaid request must not be settled.");
  }
}

class UnpaidAdapter implements HTTPAdapter {
  getAcceptHeader() {
    return "application/json";
  }

  getHeader() {
    return undefined;
  }

  getMethod() {
    return "GET";
  }

  getPath() {
    return X402_TESTNET_PATH;
  }

  getUrl() {
    return `https://tab.example${X402_TESTNET_PATH}`;
  }

  getUserAgent() {
    return "vitest";
  }
}

function environment(overrides: Record<string, string | undefined> = {}) {
  return {
    TAB_AGENT_PROVISIONING_PROFILE: "base_sepolia_integration",
    NEXT_PUBLIC_APP_URL: "https://tab.example",
    X402_TESTNET_PAYEE_ADDRESS: PAYEE,
    ...overrides,
  };
}

describe("Base Sepolia x402 resource", () => {
  it("fails closed unless the explicit integration profile is enabled", () => {
    expect(() =>
      readX402TestnetResourceConfig(environment({ TAB_AGENT_PROVISIONING_PROFILE: undefined })),
    ).toThrowError("not enabled");
    expect(() =>
      readX402TestnetResourceConfig(environment({ TAB_AGENT_PROVISIONING_PROFILE: "mainnet" })),
    ).toThrowError("not enabled");
  });

  it("rejects an insecure origin and an invalid payee", () => {
    expect(() =>
      readX402TestnetResourceConfig(environment({ NEXT_PUBLIC_APP_URL: "http://tab.example" })),
    ).toThrowError("HTTPS");
    expect(() =>
      readX402TestnetResourceConfig(environment({ X402_TESTNET_PAYEE_ADDRESS: "nope" })),
    ).toThrowError("payee");
    expect(() =>
      readX402TestnetResourceConfig(
        environment({ X402_TESTNET_PAYEE_ADDRESS: "0x0000000000000000000000000000000000000000" }),
      ),
    ).toThrowError("payee");
  });

  it("emits a genuine v2 402 declaration with the canonical immutable tuple", async () => {
    const config = readX402TestnetResourceConfig(environment());
    const server = buildX402TestnetHttpServer(config, {
      facilitator: new TestFacilitator(),
    });
    await server.initialize();
    const result = await server.processHTTPRequest({
      adapter: new UnpaidAdapter(),
      method: "GET",
      path: X402_TESTNET_PATH,
    });

    expect(result.type).toBe("payment-error");
    if (result.type !== "payment-error") throw new Error("Expected a payment error.");
    expect(result.response.status).toBe(402);
    expect(result.response.body).toMatchObject({
      error: "PAYMENT_REQUIRED",
      label: TEST_FUNDS_LABEL,
    });
    const encoded = Object.entries(result.response.headers).find(
      ([name]) => name.toLowerCase() === "payment-required",
    )?.[1];
    expect(encoded).toBeTruthy();
    const required = decodePaymentRequiredHeader(encoded as string);
    expect(required.x402Version).toBe(2);
    expect(required.resource.url).toBe("https://tab.example/api/x402/testnet");
    expect(required.accepts).toEqual([
      expect.objectContaining({
        amount: X402_TESTNET_AMOUNT,
        asset: BASE_SEPOLIA_USDC,
        extra: expect.objectContaining({ name: "USDC", version: "2" }),
        network: X402_TESTNET_NETWORK,
        payTo: PAYEE,
        scheme: "exact",
      }),
    ]);
    expect(config.facilitatorUrl).toBe(X402_TESTNET_FACILITATOR);
  });

  it("canonicalizes transaction and authorization identities before durable comparison", () => {
    const config = readX402TestnetResourceConfig(environment());
    const requirements = {
      amount: X402_TESTNET_AMOUNT,
      asset: BASE_SEPOLIA_USDC,
      extra: { name: "USDC", version: "2" },
      maxTimeoutSeconds: 120,
      network: X402_TESTNET_NETWORK,
      payTo: PAYEE,
      scheme: "exact" as const,
    };
    const nonce = `0x${"AB".repeat(32)}` as const;
    const transaction = `0x${"CD".repeat(32)}` as const;

    const settlement = normalizeX402TestnetSettlement(config, {
      declaredExtensions: {},
      paymentPayload: {
        accepted: requirements,
        payload: {
          authorization: {
            from: PAYER,
            nonce,
            to: PAYEE,
            validAfter: "0",
            validBefore: "2000000000",
            value: X402_TESTNET_AMOUNT,
          },
          signature: `0x${"11".repeat(65)}`,
        },
        x402Version: 2,
      },
      requirements,
      result: {
        amount: X402_TESTNET_AMOUNT,
        network: X402_TESTNET_NETWORK,
        payer: PAYER,
        success: true,
        transaction,
      },
    });

    expect(settlement.nonce).toBe(nonce.toLowerCase());
    expect(settlement.transactionHash).toBe(transaction.toLowerCase());
  });
});
