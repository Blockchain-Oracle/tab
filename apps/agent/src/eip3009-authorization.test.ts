import { describe, expect, it } from "vitest";

import {
  InvalidEip3009AuthorizationError,
  parseExactEip3009Authorization,
} from "./eip3009-authorization.js";

const agentAddress = "0x2222222222222222222222222222222222222222";
const nowSeconds = 1_784_271_300;
const maxAtomicUsdcAmount = 999_999_999_999_999_999_990_000n;

function authorization(value: bigint) {
  return {
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
      validAfter: 0n,
      validBefore: BigInt(nowSeconds + 60),
      value,
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
  };
}

describe("EIP-3009 USDC amount bound", () => {
  it("accepts the largest amount representable by the product cap domain", () => {
    expect(
      parseExactEip3009Authorization(authorization(maxAtomicUsdcAmount), {
        address: agentAddress,
        nowSeconds,
        paymentProfile: "mainnet",
      }).amount,
    ).toBe(maxAtomicUsdcAmount.toString());
  });

  it("rejects one atomic unit above the product cap domain", () => {
    expect(() =>
      parseExactEip3009Authorization(authorization(maxAtomicUsdcAmount + 1n), {
        address: agentAddress,
        nowSeconds,
        paymentProfile: "mainnet",
      }),
    ).toThrow(InvalidEip3009AuthorizationError);
  });

  it("accepts only the Base Sepolia Circle USDC domain in integration mode", () => {
    const request = authorization(25_000n);
    request.domain = {
      chainId: 84532,
      name: "USDC",
      verifyingContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      version: "2",
    };

    const parsed = parseExactEip3009Authorization(request, {
      address: agentAddress,
      nowSeconds,
      paymentProfile: "base_sepolia_integration",
    });
    expect(parsed).toMatchObject({
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      network: "eip155:84532",
      typedData: { domain: { chainId: 84532, name: "USDC", version: "2" } },
    });
  });

  it("does not allow either payment profile to cross into the other", () => {
    const testnet = authorization(25_000n);
    testnet.domain = {
      chainId: 84532,
      name: "USDC",
      verifyingContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      version: "2",
    };

    expect(() =>
      parseExactEip3009Authorization(testnet, {
        address: agentAddress,
        nowSeconds,
        paymentProfile: "mainnet",
      }),
    ).toThrow(InvalidEip3009AuthorizationError);
    expect(() =>
      parseExactEip3009Authorization(authorization(25_000n), {
        address: agentAddress,
        nowSeconds,
        paymentProfile: "base_sepolia_integration",
      }),
    ).toThrow(InvalidEip3009AuthorizationError);
  });

  it("rejects the mainnet token name for Base Sepolia", () => {
    const request = authorization(25_000n);
    request.domain = {
      chainId: 84532,
      name: "USD Coin",
      verifyingContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      version: "2",
    };

    expect(() =>
      parseExactEip3009Authorization(request, {
        address: agentAddress,
        nowSeconds,
        paymentProfile: "base_sepolia_integration",
      }),
    ).toThrow(InvalidEip3009AuthorizationError);
  });
});
