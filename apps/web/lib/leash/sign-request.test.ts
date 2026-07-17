import { describe, expect, it } from "vitest";

import { InvalidSignRequestError, parseSignRequest } from "./sign-request";

const agentAddress = "0x2222222222222222222222222222222222222222";

function validRequest() {
  return {
    amount: "25000",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    network: "eip155:8453",
    origin: { clientName: "Claude Code", toolName: "search", transport: "mcp" },
    payTo: "0x1111111111111111111111111111111111111111",
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
    expect(
      parseSignRequest(validRequest(), { agentAddress, nowSeconds: 1_784_271_300 }),
    ).toMatchObject({
      amountAtomic: "25000",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      authorizationNonce: `0x${"12".repeat(32)}`,
      authorizationValidBefore: new Date(1_784_271_600_000),
      network: "eip155:8453",
      payTo: "0x1111111111111111111111111111111111111111",
      requestFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
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

    expect(() => parseSignRequest(request, { agentAddress, nowSeconds: 1_784_271_300 })).toThrow(
      InvalidSignRequestError,
    );
  });
});
