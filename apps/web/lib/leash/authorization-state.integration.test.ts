import { createServer } from "node:http";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AuthorizationStateError,
  readAuthorizationUsed,
  readFinalizedAuthorizationUsed,
} from "./authorization-state";

const payer = "0x2222222222222222222222222222222222222222";
const nonce = `0x${"11".repeat(32)}`;

describe("trusted USDC authorization-state reconciliation", () => {
  let rpcUrl = "";
  let chainId = 84_532;
  let finalizedTimestamp = 1_784_400_300;
  let used = false;
  const finalizedHash = `0x${"ab".repeat(32)}`;
  const methods: string[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (Array.isArray(body)) {
      methods.push(...body.map((entry) => entry.method));
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify([
          { id: 1, jsonrpc: "2.0", result: `0x${chainId.toString(16)}` },
          {
            id: 2,
            jsonrpc: "2.0",
            result: {
              hash: finalizedHash,
              number: "0x123",
              timestamp: `0x${finalizedTimestamp.toString(16)}`,
            },
          },
        ]),
      );
      return;
    }
    methods.push(body.method);
    if (body.method === "eth_call" && typeof body.params?.[1] === "object") {
      expect(body.params[1]).toEqual({ blockHash: finalizedHash, requireCanonical: true });
    }
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        id: body.id,
        jsonrpc: "2.0",
        result:
          body.method === "eth_chainId"
            ? `0x${chainId.toString(16)}`
            : `0x${(used ? "1" : "0").padStart(64, "0")}`,
      }),
    );
  });

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP listener");
    rpcUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("checks chain ID then reads the exact Circle USDC authorization nonce", async () => {
    used = true;
    chainId = 84_532;
    await expect(
      readAuthorizationUsed({ network: "eip155:84532", nonce, payer, rpcUrl }),
    ).resolves.toBe(true);
    expect(methods.slice(-2)).toEqual(["eth_chainId", "eth_call"]);
  });

  it("fails closed before the contract read when the RPC is on another chain", async () => {
    chainId = 1;
    const before = methods.length;
    await expect(
      readAuthorizationUsed({ network: "eip155:84532", nonce, payer, rpcUrl }),
    ).rejects.toMatchObject({ code: "RPC_CHAIN_MISMATCH" });
    expect(methods.slice(before)).toEqual(["eth_chainId"]);
  });

  it.each([
    [false, false],
    [true, true],
  ])("pins the finalized expiration proof to one canonical block", async (state, expected) => {
    chainId = 84_532;
    finalizedTimestamp = 1_784_400_300;
    used = state;

    await expect(
      readFinalizedAuthorizationUsed({
        network: "eip155:84532",
        nonce,
        payer,
        rpcUrl,
        validBeforeSeconds: finalizedTimestamp,
      }),
    ).resolves.toBe(expected);
    expect(methods.slice(-3)).toEqual(["eth_chainId", "eth_getBlockByNumber", "eth_call"]);
  });

  it("fails closed before expiry is finalized and redacts RPC failures", async () => {
    finalizedTimestamp = 1;
    await expect(
      readFinalizedAuthorizationUsed({
        network: "eip155:84532",
        nonce,
        payer,
        rpcUrl,
        validBeforeSeconds: 2,
      }),
    ).rejects.toEqual(new AuthorizationStateError("FINALIZED_AUTHORIZATION_STATE_UNAVAILABLE"));

    const secret = "rpc-query-credential-must-not-escape";
    const unavailable = await readFinalizedAuthorizationUsed({
      fetch: async () => {
        throw new Error(secret);
      },
      network: "eip155:84532",
      nonce,
      payer,
      rpcUrl: `https://rpc.example.test/?key=${secret}`,
      validBeforeSeconds: 2,
    }).catch((error: unknown) => error);
    expect(unavailable).toBeInstanceOf(AuthorizationStateError);
    expect(String(unavailable)).not.toContain(secret);
    expect(JSON.stringify(unavailable)).not.toContain(secret);

    await expect(
      readFinalizedAuthorizationUsed({
        fetch: async () => new Response(new ReadableStream({ start() {} })),
        network: "eip155:84532",
        nonce,
        payer,
        rpcUrl,
        signal: AbortSignal.timeout(10),
        validBeforeSeconds: 2,
      }),
    ).rejects.toEqual(new AuthorizationStateError("FINALIZED_AUTHORIZATION_STATE_UNAVAILABLE"));
  });
});
