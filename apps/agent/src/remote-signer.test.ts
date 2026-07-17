import { describe, expect, it, vi } from "vitest";

import { LeashRemoteSigner, type RemoteSignerError } from "./remote-signer.js";

const signature = `0x${"ab".repeat(65)}` as const;
const signerRequest = {
  domain: {
    chainId: 8453,
    name: "USD Coin",
    verifyingContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    version: "2",
  },
  message: {
    from: "0x2222222222222222222222222222222222222222",
    nonce: `0x${"12".repeat(32)}`,
    to: "0x1111111111111111111111111111111111111111",
    validAfter: "0",
    validBefore: "9999999999",
    value: "25000",
  },
  primaryType: "TransferWithAuthorization",
  types: {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
  },
};

describe("Leash remote signer wire", () => {
  it("posts exact payment authority and correlates the returned receipt", async () => {
    const fetch = vi.fn(async (_input: Request | string | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ authorization: "Bearer leash_sk_secret" });
      expect(JSON.parse(String(init?.body))).toEqual({
        amount: "25000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        network: "eip155:8453",
        origin: { clientName: "Claude Code", toolName: "search", transport: "mcp" },
        payTo: "0x1111111111111111111111111111111111111111",
        signerRequest,
      });
      return Response.json({ receiptId: "receipt-1", signature });
    });
    const signer = new LeashRemoteSigner({
      address: "0x2222222222222222222222222222222222222222",
      apiBaseUrl: "https://tab.example.test/",
      apiKey: "leash_sk_secret",
      fetch,
      origin: () => ({ clientName: "Claude Code", toolName: "search", transport: "mcp" }),
    });

    await expect(signer.signTypedData(signerRequest)).resolves.toBe(signature);
    expect(signer.takeReceiptId(signature)).toBe("receipt-1");
    expect(signer.takeReceiptId(signature)).toBeNull();
  });

  it("preserves a fail-closed backend error code without inventing a signature", async () => {
    const signer = new LeashRemoteSigner({
      address: "0x2222222222222222222222222222222222222222",
      apiBaseUrl: "https://tab.example.test",
      apiKey: "leash_sk_secret",
      fetch: async () =>
        Response.json(
          { error: { code: "SIGNER_NOT_CONFIGURED", message: "Signer is not configured." } },
          { status: 409 },
        ),
    });

    await expect(signer.signTypedData(signerRequest)).rejects.toMatchObject({
      code: "SIGNER_NOT_CONFIGURED",
      status: 409,
    } satisfies Partial<RemoteSignerError>);
  });
});
