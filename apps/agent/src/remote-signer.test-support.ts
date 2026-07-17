import type { PaymentResponseContext } from "@x402/core/client";
import { privateKeyToAccount } from "viem/accounts";

import { LeashRemoteSigner } from "./remote-signer.js";

export const nowSeconds = 1_784_271_300;
export const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
export const otherAccount = privateKeyToAccount(`0x${"22".repeat(32)}`);
export const transaction = `0x${"cd".repeat(32)}`;

export function signWith(signer: typeof account, request: ReturnType<typeof validSignerRequest>) {
  return signer.signTypedData(request as unknown as Parameters<typeof signer.signTypedData>[0]);
}

export function validSignerRequest() {
  return {
    domain: {
      chainId: 8453,
      name: "USD Coin",
      verifyingContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      version: "2",
    },
    message: {
      from: account.address,
      nonce: `0x${"12".repeat(32)}`,
      to: "0x1111111111111111111111111111111111111111",
      validAfter: 0n,
      validBefore: BigInt(nowSeconds + 60),
      value: 25_000n,
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

export function paymentContext(signature: `0x${string}`): PaymentResponseContext {
  return {
    paymentPayload: {
      accepted: {
        amount: "25000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        extra: { name: "USD Coin", version: "2" },
        maxTimeoutSeconds: 60,
        network: "eip155:8453",
        payTo: "0x1111111111111111111111111111111111111111",
        scheme: "exact",
      },
      payload: { signature },
      x402Version: 2,
    },
    requirements: {
      amount: "25000",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      extra: { name: "USD Coin", version: "2" },
      maxTimeoutSeconds: 60,
      network: "eip155:8453",
      payTo: "0x1111111111111111111111111111111111111111",
      scheme: "exact",
    },
    settleResponse: {
      network: "eip155:8453",
      payer: account.address,
      success: true,
      transaction,
    },
  };
}

export function failedPaymentContext(signature: `0x${string}`): PaymentResponseContext {
  const context = paymentContext(signature);
  return {
    ...context,
    settleResponse: {
      errorMessage: "Transaction reverted after broadcast.",
      errorReason: "invalid_exact_evm_transaction_failed",
      network: "eip155:8453",
      payer: account.address,
      success: false,
      transaction,
    },
  };
}

export function signerWithFetch(fetch: typeof globalThis.fetch) {
  return new LeashRemoteSigner({
    address: account.address,
    apiBaseUrl: "https://tab.example.test/",
    apiKey: "leash_sk_secret",
    fetch,
    nowSeconds: () => nowSeconds,
    resourceUrl: credentialedResourceUrl,
    reportRetryDelayMs: 1,
    reportTimeoutMs: 10,
  });
}

function credentialedResourceUrl() {
  const url = new URL("https://TOOL.EXAMPLE.TEST:8443/search");
  url.username = "wire-user";
  url.password = "wire-pass";
  url.searchParams.set("token", "wire-secret");
  url.hash = "fragment";
  return url.toString();
}
