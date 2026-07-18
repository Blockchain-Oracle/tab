import { describe, expect, it } from "vitest";

import { LeashRemoteSigner } from "./remote-signer.js";
import { account, nowSeconds, validSignerRequest } from "./remote-signer.test-support.js";

describe("remote signer request cancellation", () => {
  it("propagates the payment request signal and classifies cancellation", async () => {
    const controller = new AbortController();
    const signer = new LeashRemoteSigner({
      address: account.address,
      apiBaseUrl: "https://tab.example.test/",
      apiKey: "leash_sk_secret",
      fetch: async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
            once: true,
          });
          controller.abort();
        }),
      nowSeconds: () => nowSeconds,
      paymentProfile: "mainnet",
      signal: () => controller.signal,
    });

    await expect(signer.signTypedData(validSignerRequest())).rejects.toMatchObject({
      code: "SIGNER_REQUEST_CANCELLED",
      status: 499,
    });
  });
});
