import type { PaymentRequired } from "@x402/core/types";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";

import { createLeashPaymentClient } from "./payment-client.js";
import type { LeashRemoteSigner } from "./remote-signer.js";
import { BASE_NETWORK, BASE_SEPOLIA_NETWORK, BASE_SEPOLIA_USDC, BASE_USDC } from "./routing.js";

const account = privateKeyToAccount(`0x${"55".repeat(32)}`);
const signer = {
  address: account.address,
  reportPaymentObservation: vi.fn(),
  signTypedData: account.signTypedData,
} as unknown as LeashRemoteSigner;

function challenge(network: typeof BASE_NETWORK | typeof BASE_SEPOLIA_NETWORK): PaymentRequired {
  const integration = network === BASE_SEPOLIA_NETWORK;
  return {
    accepts: [
      {
        amount: "25000",
        asset: integration ? BASE_SEPOLIA_USDC : BASE_USDC,
        extra: { name: integration ? "USDC" : "USD Coin", version: "2" },
        maxTimeoutSeconds: 60,
        network,
        payTo: "0x1111111111111111111111111111111111111111",
        scheme: "exact",
      },
    ],
    resource: { url: "https://resource.example.test/protected" },
    x402Version: 2,
  };
}

describe("profile-scoped x402 scheme registration", () => {
  it("registers Base Sepolia only for the integration profile", async () => {
    const client = createLeashPaymentClient(signer, "base_sepolia_integration");

    await expect(
      client.createPaymentPayload(challenge(BASE_SEPOLIA_NETWORK)),
    ).resolves.toMatchObject({ accepted: { network: BASE_SEPOLIA_NETWORK } });
    await expect(client.createPaymentPayload(challenge(BASE_NETWORK))).rejects.toThrow();
  });

  it("does not register Base Sepolia for the mainnet profile", async () => {
    const client = createLeashPaymentClient(signer, "mainnet");

    await expect(client.createPaymentPayload(challenge(BASE_NETWORK))).resolves.toMatchObject({
      accepted: { network: BASE_NETWORK },
    });
    await expect(client.createPaymentPayload(challenge(BASE_SEPOLIA_NETWORK))).rejects.toThrow();
  });
});
