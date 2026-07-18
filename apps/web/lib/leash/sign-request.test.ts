import { describe, expect, it } from "vitest";

import { InvalidSignRequestError, parseSignRequest } from "./sign-request";

const agentAddress = "0x2222222222222222222222222222222222222222";
const maxAtomicUsdcAmount = BigInt("999999999999999999990000");

function parse(
  request: ReturnType<typeof validRequest>,
  paymentProfile: "mainnet" | "base_sepolia_integration" = "mainnet",
) {
  return parseSignRequest(request, {
    agentAddress,
    nowSeconds: 1_784_271_300,
    paymentProfile,
  });
}

function validRequest() {
  return {
    amount: "25000",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    network: "eip155:8453",
    origin: { clientName: "Claude Code", toolName: "search", transport: "mcp" },
    payTo: "0x1111111111111111111111111111111111111111",
    resourceUrl: "mcp://tool/search",
    signerRequest: {
      domain: {
        chainId: 8453,
        name: "USD Coin",
        verifyingContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        version: "2",
      },
      message: {
        from: agentAddress,
        nonce: `0x${"12".repeat(32)}`,
        to: "0x1111111111111111111111111111111111111111",
        validAfter: "0",
        validBefore: "1784271600",
        value: "25000",
      },
      primaryType: "TransferWithAuthorization",
      types: {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
    },
  };
}

describe("remote EIP-3009 sign request validation", () => {
  it("derives canonical authority from the exact x402 typed-data shape", () => {
    expect(parse(validRequest())).toMatchObject({
      amountAtomic: "25000",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      authorizationNonce: `0x${"12".repeat(32)}`,
      authorizationValidBefore: new Date(1_784_271_600_000),
      network: "eip155:8453",
      payTo: "0x1111111111111111111111111111111111111111",
      resourceHost: "tool",
      resourceUrl: "mcp://tool/search",
      requestFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("accepts the cap-domain ceiling and rejects one atomic unit above it", () => {
    const largest = validRequest();
    largest.amount = maxAtomicUsdcAmount.toString();
    largest.signerRequest.message.value = largest.amount;
    expect(parse(largest).amountAtomic).toBe(maxAtomicUsdcAmount.toString());

    const oversized = validRequest();
    oversized.amount = (maxAtomicUsdcAmount + BigInt(1)).toString();
    oversized.signerRequest.message.value = oversized.amount;
    expect(() => parse(oversized)).toThrow(InvalidSignRequestError);
  });

  it("canonicalizes receipt resource provenance and removes URL secrets server-side", () => {
    const request = validRequest();
    request.resourceUrl =
      "MCP://receipt-user:receipt-password@PAYMENTS.Example.TEST/tool/search?api_key=receipt-secret#fragment-secret";

    const parsed = parse(request);

    expect(parsed).toMatchObject({
      resourceHost: "payments.example.test",
      resourceUrl: "mcp://payments.example.test/tool/search",
    });
    expect(JSON.stringify(parsed)).not.toMatch(
      /receipt-user|receipt-password|receipt-secret|fragment-secret/,
    );
  });

  it.each([
    "not an absolute URL",
    "file:///hostless/path",
    "mailto:hostless@example.test",
    "ftp://tool.example.test/pay",
    `https://example.test/${"x".repeat(2_049)}`,
  ])("rejects malformed, hostless, or overlong resource provenance: %s", (resourceUrl) => {
    const request = validRequest();
    request.resourceUrl = resourceUrl;

    expect(() => parse(request)).toThrow(InvalidSignRequestError);
  });

  it("canonicalizes nonce casing before fingerprinting and returning signer data", () => {
    const mixedCase = validRequest();
    mixedCase.signerRequest.message.nonce = `0x${"aB".repeat(32)}`;
    const lowercase = validRequest();
    lowercase.signerRequest.message.nonce = mixedCase.signerRequest.message.nonce.toLowerCase();

    const first = parse(mixedCase);
    const second = parse(lowercase);

    expect(first.authorizationNonce).toBe(`0x${"ab".repeat(32)}`);
    expect(first.signerRequest.message.nonce).toBe(`0x${"ab".repeat(32)}`);
    expect(first.requestFingerprint).toBe(second.requestFingerprint);
  });

  it("redacts HTTP credentials, queries, and fragments from persisted origin telemetry", () => {
    const request = validRequest();
    request.origin = {
      clientName: "leash-fetch",
      toolName:
        "post https://receipt-user:receipt-password@example.test/v1/pay?api_key=receipt-secret#fragment-secret",
      transport: "http",
    };

    const parsed = parse(request);

    expect(parsed.origin).toEqual({
      clientName: "leash-fetch",
      toolName: "POST https://example.test/v1/pay",
      transport: "http",
    });
    expect(JSON.stringify(parsed.origin)).not.toMatch(
      /receipt-user|receipt-password|receipt-secret|fragment-secret/,
    );
  });

  it.each([
    "POST not-an-absolute-url?api_key=receipt-secret",
    "GET javascript:alert('receipt-secret')",
    "SECRET https://example.test/protected",
  ])("replaces malformed HTTP telemetry with a generic safe label: %s", (toolName) => {
    const request = validRequest();
    request.origin = { clientName: "leash-fetch", toolName, transport: "http" };

    const parsed = parse(request);

    expect(parsed.origin?.toolName).toBe("HTTP request");
    expect(JSON.stringify(parsed.origin)).not.toContain(toolName);
  });

  it.each([
    [
      "Permit2",
      (request: ReturnType<typeof validRequest>) =>
        (request.signerRequest.primaryType = "PermitTransferFrom"),
    ],
    [
      "another token",
      (request: ReturnType<typeof validRequest>) =>
        (request.asset = "0x3333333333333333333333333333333333333333"),
    ],
    [
      "another payer",
      (request: ReturnType<typeof validRequest>) =>
        (request.signerRequest.message.from = "0x4444444444444444444444444444444444444444"),
    ],
    [
      "a mismatched amount",
      (request: ReturnType<typeof validRequest>) => (request.amount = "25001"),
    ],
    [
      "a mismatched recipient",
      (request: ReturnType<typeof validRequest>) =>
        (request.payTo = "0x5555555555555555555555555555555555555555"),
    ],
    [
      "an expired authorization",
      (request: ReturnType<typeof validRequest>) =>
        (request.signerRequest.message.validBefore = "1784271200"),
    ],
  ])("rejects %s", (_label, mutate) => {
    const request = validRequest();
    mutate(request);

    expect(() => parse(request)).toThrow(InvalidSignRequestError);
  });

  it("accepts Base Sepolia only for the explicit integration profile", () => {
    const request = validRequest();
    request.asset = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
    request.network = "eip155:84532";
    request.signerRequest.domain = {
      chainId: 84_532,
      name: "USDC",
      verifyingContract: request.asset,
      version: "2",
    };

    expect(parse(request, "base_sepolia_integration")).toMatchObject({
      asset: request.asset,
      network: "eip155:84532",
      signerRequest: { domain: { chainId: 84_532, name: "USDC", version: "2" } },
    });
    expect(() => parse(request, "mainnet")).toThrow(InvalidSignRequestError);
    expect(() => parse(validRequest(), "base_sepolia_integration")).toThrow(
      InvalidSignRequestError,
    );
  });
});
