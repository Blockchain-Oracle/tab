import { encodePaymentSignatureHeader } from "@x402/core/http";
import type { PaymentPayload } from "@x402/core/types";
import { describe, expect, it } from "vitest";

import { parsePaymentEnvelope } from "./payment-envelope.js";
import { account, signWith, validSignerRequest } from "./remote-signer.test-support.js";

async function envelope() {
  const request = validSignerRequest();
  const signature = await signWith(account, request);
  const payload = {
    accepted: {
      amount: "25000",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      extra: { name: "USD Coin", version: "2" },
      maxTimeoutSeconds: 60,
      network: "eip155:8453",
      payTo: "0x1111111111111111111111111111111111111111",
      scheme: "exact",
    },
    payload: {
      authorization: {
        from: account.address,
        nonce: request.message.nonce,
        to: request.message.to,
        validAfter: "0",
        validBefore: String(request.message.validBefore),
        value: String(request.message.value),
      },
      signature,
    },
    x402Version: 2,
  } satisfies PaymentPayload;
  return { header: encodePaymentSignatureHeader(payload), payload };
}

describe("persisted x402 payment envelope", () => {
  it("recovers the configured signer and exact authorization identity", async () => {
    const { header, payload } = await envelope();
    await expect(parsePaymentEnvelope(header, account.address, "mainnet")).resolves.toMatchObject({
      asset: payload.accepted.asset,
      from: account.address,
      network: "eip155:8453",
      nonce: payload.payload.authorization.nonce,
      payload,
      validBefore: Number(payload.payload.authorization.validBefore),
    });
  });

  it("rejects tampered signatures and profile/network mismatches", async () => {
    const { header } = await envelope();
    const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    decoded.payload.signature = `0x${"34".repeat(65)}`;
    const forged = Buffer.from(JSON.stringify(decoded)).toString("base64");

    await expect(parsePaymentEnvelope(forged, account.address, "mainnet")).rejects.toThrow(
      "persisted payment envelope is invalid",
    );
    await expect(
      parsePaymentEnvelope(header, account.address, "base_sepolia_integration"),
    ).rejects.toThrow("persisted payment envelope is invalid");
  });
});
