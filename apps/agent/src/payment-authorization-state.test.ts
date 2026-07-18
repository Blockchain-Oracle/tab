import { encodeFunctionResult } from "viem";
import { describe, expect, it, vi } from "vitest";

import {
  AUTHORIZATION_STATE_ABI,
  PaymentReconciliationUnavailableError,
  readPaymentAuthorizationState,
} from "./payment-authorization-state.js";
import { account } from "./remote-signer.test-support.js";

const identity = {
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const,
  from: account.address,
  network: "eip155:84532" as const,
  nonce: `0x${"12".repeat(32)}` as const,
  validBefore: 1_784_400_300,
};

function head(chainId = "0x14a34", timestamp = `0x${identity.validBefore.toString(16)}`) {
  return Response.json([
    { id: 1, jsonrpc: "2.0", result: chainId },
    {
      id: 2,
      jsonrpc: "2.0",
      result: { hash: `0x${"ab".repeat(32)}`, number: "0x123", timestamp },
    },
  ]);
}

function state(used: boolean) {
  return Response.json({
    id: 3,
    jsonrpc: "2.0",
    result: encodeFunctionResult({
      abi: AUTHORIZATION_STATE_ABI,
      functionName: "authorizationState",
      result: used,
    }),
  });
}

describe("independent payer authorization reconciliation", () => {
  it.each([
    [true, "used"],
    [false, "unused"],
  ] as const)("verifies trusted chain identity and returns %s", async (used, expected) => {
    const fetch = vi.fn(async (_input: Request | string | URL, init?: RequestInit) => {
      expect(init?.redirect).toBe("error");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      const body = JSON.parse(String(init?.body));
      if (Array.isArray(body)) {
        expect(body).toHaveLength(2);
        expect(body[0].method).toBe("eth_chainId");
        expect(body[1]).toMatchObject({
          method: "eth_getBlockByNumber",
          params: ["finalized", false],
        });
        return head();
      }
      expect(body.method).toBe("eth_call");
      expect(body.params[0].to).toBe(identity.asset);
      expect(body.params[1]).toEqual({
        blockHash: `0x${"ab".repeat(32)}`,
        requireCanonical: true,
      });
      return state(used);
    });

    await expect(
      readPaymentAuthorizationState(identity, {
        fetch,
        rpcUrl: "https://base-sepolia-rpc.example",
      }),
    ).resolves.toBe(expected);
  });

  it("will not discard an unused authorization before finalized chain time reaches expiry", async () => {
    await expect(
      readPaymentAuthorizationState(identity, {
        fetch: async () => head("0x14a34", "0x1"),
        rpcUrl: "https://base-sepolia-rpc.example",
      }),
    ).rejects.toBeInstanceOf(PaymentReconciliationUnavailableError);
  });

  it("fails closed for the wrong chain, oversized body, or transport failure", async () => {
    for (const fetch of [
      vi.fn(async () => head("0x1")),
      vi.fn(
        async () =>
          new Response(new Uint8Array(70_000), {
            headers: { "content-type": "application/json" },
          }),
      ),
      vi.fn(async () => {
        throw new Error("private RPC secret");
      }),
    ]) {
      await expect(
        readPaymentAuthorizationState(identity, {
          fetch,
          rpcUrl: "https://base-sepolia-rpc.example",
        }),
      ).rejects.toBeInstanceOf(PaymentReconciliationUnavailableError);
    }
  });
});
